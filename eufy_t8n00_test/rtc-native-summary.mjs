// Emit only fixed event names and numeric sizes, never raw native messages or SDP.
export function nativeHandshakeSummary(message) {
  const events = ['Initializing DTLS transport (OpenSSL)', 'Initializing DTLS transport (GnuTLS)', 'Initializing DTLS transport (MbedTLS)', 'Starting DTLS transport', 'Stopping DTLS transport', 'DTLS handshake finished', 'DTLS handshake failed', 'Handshake timeout', 'DTLS closed', 'Starting SCTP transport', 'SCTP connected'];
  for (const event of events) if (message.includes(event)) return event;
  if (/dtlstransport/i.test(message)) {
    const size = message.match(/\b(Send size|Incoming size|DTLS MTU set to)[= ]+(\d+)\b/);
    if (size) return `${size[1]}=${size[2]}`;
    for (const reason of ['no shared cipher', 'certificate verify failed', 'bad certificate', 'handshake failure', 'wrong version number', 'unsupported certificate']) {
      if (message.toLowerCase().includes(reason)) return `DTLS error: ${reason}`;
    }
    if (message.includes('DTLS recv:')) return 'DTLS receive error (unclassified)';
    if (message.includes('DTLS alert:')) return 'DTLS alert (unclassified)';
  }
}
