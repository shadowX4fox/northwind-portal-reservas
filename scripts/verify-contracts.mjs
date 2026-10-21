// Comprueba que las copias de los contratos son los bytes del build pack (BUILD.md, regla 1).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const CONTRACTS = {
  // asset:c4-descriptor.md del build pack de Portal de Reservas, 1.8.0
  'architecture/c4-descriptor.md': 'fb04d14365d9a9225233822a04fd8d46fc4a099be0bcd93e51295333810ebd9f',
  // asset:openapi.yaml del build pack de Servicio de Reservas, 1.8.0 (pack_revision f08dfacee0da955bea5f6a3dbeafd93dae837d1e064ce3853d90de01688710a3)
  'contracts/servicio-de-reservas/openapi.yaml': '285a98555247b8eb21de37373bf49a134bba3f852b9089c09c7f9ffa1320d449',
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
