import fs from 'node:fs'
import path from 'node:path'

const target = path.resolve(process.cwd(), 'helper', 'index.ts')
const content = `# Local IDM Helper

This mock installer creates a starter helper configuration and reminds the user to run the helper service.

- Helper entry: ${target}
- Port: 43123
- Token: local-helper-demo-token
- Bind: 127.0.0.1 only

Run with:

npm run dev:helper
`

fs.writeFileSync(path.resolve(process.cwd(), 'helper', 'README.txt'), content)
console.log('Helper setup files created in ./helper')
