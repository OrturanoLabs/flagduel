import type { Express, Request, Response } from "express";
import { z } from "zod";
import path from "node:path";
import type { StatsFilters } from "../../../packages/shared/src/statistics";
import { Statistics } from "./statistics";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const d = new Date(value + "T00:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value;
  }, "Data non valida");
export const statsQuerySchema = z
  .object({
    mode: z.enum(["pvp", "solo"]).optional(),
    experiment: z
      .enum(["standard", "color_shift", "no_memory", "both"])
      .optional(),
    tolerance: z
      .enum(["0.02", "0.04", "0.1"])
      .optional()
      .transform((v) => (v === undefined ? undefined : Number(v))),
    maxProbes: z
      .union([z.literal("unlimited"), z.string().regex(/^[1-9][0-9]{0,6}$/)])
      .optional()
      .transform((v) =>
        v === undefined ? undefined : v === "unlimited" ? null : Number(v),
      ),
    catalogVersion: z
      .string()
      .regex(/^[a-f0-9]{16}$/)
      .optional(),
    from: date.optional(),
    to: date.optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
  })
  .strict()
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "Intervallo date non valido",
  );
export function installStatistics(app: Express, stats: Statistics) {
  const base = stats.accessPath;
  const privateHeaders = (_req: Request, res: Response, next: () => void) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    });
    next();
  };
  app.use(base, privateHeaders);
  app.get([base, base + "/"], (_req, res) =>
    res.sendFile(path.resolve("apps/web/dist/stats.html")),
  );
  const withFilters =
    (
      handler: (
        filters: StatsFilters,
        page: number,
        req: Request,
        res: Response,
      ) => void,
    ) =>
    (req: Request, res: Response) => {
      const parsed = statsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Filtri non validi" });
        return;
      }
      const { page, ...filters } = parsed.data;
      try {
        handler(filters, page, req, res);
      } catch (error) {
        console.error("Statistiche: lettura fallita", error);
        res.status(500).json({ error: "Impossibile leggere le statistiche" });
      }
    };
  app.get(
    base + "/api/summary",
    withFilters((filters, _page, _req, res) =>
      res.json({ ...stats.summary(filters), writeErrors: stats.writeErrors }),
    ),
  );
  app.get(
    base + "/api/rounds",
    withFilters((filters, page, _req, res) =>
      res.json(stats.rounds(filters, page)),
    ),
  );
  app.get(base + "/api/round/:id", (req, res) => {
    if (typeof req.params.id !== "string" || req.params.id.length > 100) {
      res.sendStatus(404);
      return;
    }
    const detail = stats.detail(req.params.id);
    if (!detail) {
      res.sendStatus(404);
      return;
    }
    res.json(detail);
  });
  app.get(
    base + "/countries.csv",
    withFilters((filters, _page, _req, res) => {
      const rows = stats.summary(filters).countries;
      const columns = [
        "code",
        "name",
        "draws",
        "occurrencePct",
        "expectedDraws",
        "expectedOccurrencePct",
        "completed",
        "found",
        "notFound",
        "notFoundPct",
        "unfinished",
        "meanGuessesFound",
        "meanProbesFound",
        "meanGuessesCompleted",
      ] as const;
      const escape = (value: unknown) =>
        `"${String(value ?? "").replaceAll('"', '""')}"`;
      const csv = [
        columns.join(","),
        ...rows.map((row) => columns.map((key) => escape(row[key])).join(",")),
      ].join("\r\n");
      res
        .type("text/csv")
        .attachment("flag-duel-statistiche.csv")
        .send("\ufeff" + csv);
    }),
  );
  // Il nome dell'HTML compilato non è un secondo ingresso pubblico.
  app.get("/stats.html", (_req, res) => res.sendStatus(404));
}
