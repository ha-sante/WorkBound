let _rpc: { send: MessageSend } | null = null;

export function set_outbox_rpc(rpc: { send: MessageSend }) {
  _rpc = rpc;
}

export function get_rpc(): { send: MessageSend } | null {
  return _rpc;
}
