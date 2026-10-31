// Comprueba que las copias de los contratos son los bytes del build pack (BUILD.md, regla 1).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const CONTRACTS = {
  // asset:c4-descriptor.md del build pack de Portal de Reservas, 1.10.2 (pack_revision edb2cb3ba8122fe3952da149ac23f937dced7eff18538afe805f2052611bd4ff)
  'architecture/c4-descriptor.md': 'a0305d3356a82b0d66d4cb340504e91b63e20d540434a6d9bd08f6061ba54154',
  // dependency:servicio-de-reservas/openapi.yaml del build pack de Portal de Reservas, 1.10.2 (misma pack_revision)
  'architecture/deps/servicio-de-reservas/openapi.yaml': '07537e884fe847a6b0ed94d4f5037e31634fe6dd3d79c08daf686d4aa98a7fc3',
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
