// Wrap individual RTP Opus payloads for the FFmpeg test decoder.
export function opusSamples(packet) {
  const config = packet[0] >> 3;
  const perFrame = config < 12 ? [480, 960, 1920, 2880][config & 3]
    : config < 16 ? [480, 960][config & 1] : [120, 240, 480, 960][config & 3];
  const code = packet[0] & 3;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 63 : 2;
  return perFrame * frames;
}

function page(packet, sequence, granule, flags) {
  const segments = Math.floor(packet.length / 255) + 1;
  const header = Buffer.alloc(27 + segments);
  header.write('OggS');
  header[5] = flags;
  header.writeBigUInt64LE(BigInt(granule), 6);
  header.writeUInt32LE(1, 14);
  header.writeUInt32LE(sequence, 18);
  header[26] = segments;
  header.fill(255, 27);
  header[header.length - 1] = packet.length % 255;
  const bytes = Buffer.concat([header, packet]);
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit++) crc = (crc << 1) ^ (crc < 0 ? 0x04c11db7 : 0);
  }
  bytes.writeUInt32LE(crc >>> 0, 22);
  return bytes;
}

export function opusOgg(packets) {
  const head = Buffer.from('4f707573486561640102000080bb0000000000', 'hex');
  const tags = Buffer.concat([Buffer.from('OpusTags'), Buffer.alloc(8)]);
  let granule = 0;
  return Buffer.concat([
    page(head, 0, 0, 2), page(tags, 1, 0, 0),
    ...packets.map((packet, index) => {
      granule += opusSamples(packet);
      return page(packet, index + 2, granule, index === packets.length - 1 ? 4 : 0);
    }),
  ]);
}
