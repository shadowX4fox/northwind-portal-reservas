// Comprueba que las copias de los contratos son los bytes del build pack (BUILD.md, regla 1).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const CONTRACTS = {
  // asset:c4-descriptor.md del build pack de Portal de Reservas, 1.9.1
  'architecture/c4-descriptor.md': '525459ca95a6bb16b565b74617fdfcd1e0448e1520fb551c794e5a68c61c0126',
  // asset:openapi.yaml del build pack de Servicio de Reservas, 1.9.1 (pack_revision 1912650e96a950dcf232100324baa35e74e63f1ea76c9403cc7f35934c8d7d41)
  'contracts/servicio-de-reservas/openapi.yaml': '0685687c32a8f4b7e76a7a635524886fde7d4e4f702241ba12d42d6415748091',
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
