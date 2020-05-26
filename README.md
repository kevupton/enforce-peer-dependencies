# Enforce Peer Dependencies

This package fixes a lot of the bugs associated with NPM Links.

Basically forces peerDependencies to be used for all node_modules.

This is primarily for development purposes.

### Installation
```bash
yarn add enfore-peer-dependencies
```

```bash
npm i --save enfore-peer-dependencies
```

### Usage
```js
import 'enforce-peer-dependencies';
import 'enforce-peer-dependencies/debug'; // for debugging
```

#### Jest configuration.
To add to jest just add to the configuration
`jest.config.json`
```json
{
    "resolver": "enforce-peer-dependencies/jest" 
    "resolver": "enforce-peer-dependencies/debug-jest" // for debugging
}
```

#### Ceveats
Maybe in the future we can just do it for NPM Linked packages.
