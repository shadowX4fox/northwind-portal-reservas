// Comprueba que las copias de los contratos son los bytes del build pack (BUILD.md, regla 1).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const CONTRACTS = {
  // asset:c4-descriptor.md del build pack de Portal de Reservas, 1.9.0
  'architecture/c4-descriptor.md': 'fb04d14365d9a9225233822a04fd8d46fc4a099be0bcd93e51295333810ebd9f',
  // asset:openapi.yaml del build pack de Servicio de Reservas, 1.9.0 (pack_revision ba9811a95dd4aece2d21c10d312476b9687eac01dd14ed62d1bc6bba1c168042)
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
