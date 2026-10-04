import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { nativeHandshakeSummary as summarize } from '../src/rtc-native-summary.mjs';
test('native diagnostics expose events and sizes, never arbitrary payloads', () => {
 assert.equal(summarize('dtlstransport.cpp Incoming size=123 secret'), 'Incoming size=123');
 assert.equal(summarize('dtlstransport.cpp DTLS recv: secret-token'), 'DTLS receive error (unclassified)');
 assert.equal(summarize('ice candidate secret-token'), undefined);
 assert.equal(summarize('sdp a=ice-pwd:secret'), undefined);
 assert.equal(summarize('dtlstransport.cpp no shared cipher secret'), 'DTLS error: no shared cipher');
 assert.equal(summarize('dtlstransport.cpp DTLS handshake finished'), 'DTLS handshake finished');
});
