import fs from 'fs';
import path from 'path';

const {
  author,
  browser,
  dependencies,
  description,
  engines,
  keywords,
  license,
  main,
  name: packageName,
  repository,
  version,
} = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../package.json')).toString(),
);

const distPkgJSON = {
  author,
  browser,
  dependencies,
  description,
  engines,
  keywords,
  license,
  main,
  name: packageName,
  repository,
  version,
};

fs.writeFileSync(
  path.resolve(__dirname, '../dist/package.json'),
  JSON.stringify(distPkgJSON, null, 2),
);

fs.copyFileSync(
  path.resolve(__dirname, '../README.md'),
  path.resolve(__dirname, '../dist/README.md'),
);
