import assert from 'node:assert/strict'
import { buyItem, equipItem, type Wallet } from './shop.ts'

function purse(coins: number): Wallet {
  return { coins, owned: [], equipped: [] }
}

const poor = purse(10)
assert.equal(buyItem(poor, 'visor-cobre'), 'Moedas insuficientes')
assert.equal(poor.coins, 10)
assert.deepEqual(poor.owned, [])

const wallet = purse(200)
assert.equal(buyItem(wallet, 'visor-cobre'), null)
assert.equal(wallet.coins, 170)
assert.deepEqual(wallet.equipped, ['visor-cobre'])
assert.equal(buyItem(wallet, 'visor-cobre'), 'Você já tem esse item')
assert.equal(wallet.coins, 170)

assert.equal(buyItem(wallet, 'visor-musgo'), null)
assert.deepEqual(wallet.equipped, ['visor-musgo'])
assert.ok(wallet.owned.includes('visor-cobre'))

assert.equal(equipItem(wallet, 'visor-cobre'), null)
assert.deepEqual(wallet.equipped, ['visor-cobre'])
assert.equal(equipItem(wallet, 'visor-cobre'), null)
assert.deepEqual(wallet.equipped, [])

assert.equal(buyItem(wallet, 'nope'), 'Item desconhecido')
assert.equal(equipItem(wallet, 'nope'), 'Item desconhecido')
assert.equal(equipItem(purse(0), 'faixa'), 'Você não tem esse item')

assert.equal(buyItem(wallet, 'lanterna'), null)
assert.equal(equipItem(wallet, 'visor-cobre'), null)
assert.deepEqual(wallet.equipped.slice().sort(), ['lanterna', 'visor-cobre'])

console.log('shop ok')
