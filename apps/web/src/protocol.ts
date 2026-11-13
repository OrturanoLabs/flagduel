// Re-export del protocollo condiviso dal workspace; la UI non ridefinisce i tipi wire.
export type {
  Ack,
  Command,
  Region,
  Snapshot,
} from "../../../packages/shared/src/index";
