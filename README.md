# Filecoin Saturn 🪐 JavaScript Client

This is the official JavaScript client for Filecoin Saturn. It is a work in progress and is not yet ready for production use.

## Installation

```bash
npm install @filecoin-saturn/js-client
```

## Usage

```js
import { Saturn } from '@filecoin-saturn/js-client'

const client = new Saturn()

const contentIterator = await client.fetchContent('Qm...')

const contentBuffer = await client.fetchContentBuffer('bafy...')
```

## License

Dual-licensed under [MIT](https://github.com/filecoin-saturn/L1-node/blob/master/LICENSE-MIT) + [Apache 2.0](https://github.com/filecoin-saturn/L1-node/blob/master/LICENSE-APACHE)
