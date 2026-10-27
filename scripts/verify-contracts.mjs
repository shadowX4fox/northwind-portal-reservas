// Comprueba que las copias de los contratos son los bytes del build pack (BUILD.md, regla 1).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const CONTRACTS = {
  // asset:c4-descriptor.md del build pack de Portal de Reservas, 1.10.0
  'architecture/c4-descriptor.md': '525459ca95a6bb16b565b74617fdfcd1e0448e1520fb551c794e5a68c61c0126',
  // asset:openapi.yaml del build pack de Servicio de Reservas, 1.10.0 (pack_revision 454e3ff928db647e9af704f6bf9a60e9545b8040619654d1e9869a342e7ffeca)
  'contracts/servicio-de-reservas/openapi.yaml': '07537e884fe847a6b0ed94d4f5037e31634fe6dd3d79c08daf686d4aa98a7fc3',
};

let failed = false;
for (const [file, expected] of Object.entries(CONTRACTS)) {
  const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (actual !== expected) {
    console.error(`${file}: sha256 ${actual} ≠ ${expected}`);
    failed = true;
  } else console.log(`${file}: ok`);
}
process.exit(failed ? 1 : 0);
