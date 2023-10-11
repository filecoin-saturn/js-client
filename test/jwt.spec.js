import { isJwtValid } from '#src/utils/jwt.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('JWT tests', () => {
  it('should validate a jwt', () => {
    const fixture = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2NGQ1ZGI0ZC1jYmQ3LTRkYWMtOWY4Zi01NGQyMjk0OGE3Y2UiLCJzdWIiOiJhYmMxMjMiLCJzdWJUeXBlIjoiY2xpZW50S2V5IiwiYWxsb3dfbGlzdCI6WyIqIl0sImlhdCI6MTY5NjQ3MTQ5MSwiZXhwIjoxNjk2NDc1MDkxfQ.ZJeuzb6JucwUarI7_MlomTjow4Lc4RHZsPhqDepT1q6Pxs5KNVeOQwdZeCDqFSa8QQTiK-VHoKtDH7x349F5QA'
    assert.equal(isJwtValid(fixture), false)
  })
})
