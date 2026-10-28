// Comprueba que las copias de los contratos son los bytes del build pack (BUILD.md, regla 1).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const CONTRACTS = {
  // asset:c4-descriptor.md del build pack de Portal de Reservas, 1.10.1 (pack_revision e566ddfdc684043d2f71902b966f1d29e124880844f2c80f876c44d359db6a1a)
  'architecture/c4-descriptor.md': 'a9576cc42215c80f844541a5900ebbb5034fc495d293ca3603c1dea8777ed9a6',
  // asset:openapi.yaml del build pack de Servicio de Reservas, 1.10.1 (pack_revision ec23506c209e2df3d0e008fd5bc3e3a04a3d9d658749ef32f9d365b67d40974a)
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
