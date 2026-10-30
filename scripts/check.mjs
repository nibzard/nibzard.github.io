import path from 'node:path';
import {root,build} from './build.mjs';
import {validateLinks} from './publish.mjs';
await build();
await validateLinks(path.join(root,'dist'));
console.log('Build and local links verified.');
