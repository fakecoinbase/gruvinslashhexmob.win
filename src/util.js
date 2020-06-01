const HEX = require('./hex_contract')
const { BigNumber } = require('bignumber.js')
const { format } = require('d3-format')
/*
 * displays unitized .3 U formatted values (eg. 12.345 M) with 50% opacity for fractional part
 */
const calcBigPayDaySlice = (shares, sharePool, _globals) => {
    const unclaimedSatoshis = Object.entries(_globals).length 
            ? _globals.claimStats.unclaimedSatoshisTotal
            : new BigNumber('fae0c6a6400dadc0', 16) // total claimable Satoshis
    return new BigNumber(unclaimedSatoshis.times(HEX.HEARTS_PER_SATOSHI).times(shares))
                                    .idiv(sharePool)
}

const calcAdoptionBonus = (bigPayDaySlice, _globals) => {
    const { claimedSatoshisTotal, claimedBtcAddrCount } = _globals.claimStats
    const viral = bigPayDaySlice.times(claimedBtcAddrCount).idiv(HEX.CLAIMABLE_BTC_ADDR_COUNT)
    const criticalMass = bigPayDaySlice.times(claimedSatoshisTotal).idiv(HEX.CLAIMABLE_SATOSHIS_TOTAL)
    const bonus = viral.plus(criticalMass)
    return bonus
}

const cryptoFormat = (v, currency) => {
    if (typeof currency === 'undefined') currency = 'HEX'
    if (typeof v === 'string' || typeof v === 'number') v = BigNumber(v)
    if (!v.isFinite()) currency='INVALID' // trigger switch default

    let unit = 'HEX'
    let s
    switch (currency) {
        case 'ETH':
            unit = 'ETH'
            if (v.isZero())         s = '0.000'
            else if (v.lt( 1e3))    { unit = 'Wei'; s = format(',')(v.toFixed(3, 1)) }
            else if (v.lt( 1e6))    { unit = 'Wei'; s = format(',.0f')(v.toFixed(0, 1)) }
            else if (v.lt( 1e9))    { unit = 'Wei'; s = format(',.3f')(v.div( 1e06).toFixed(3, 1))+'M' }
            else if (v.lt(1e12))    { unit = 'Wei'; s = format(',.3f')(v.div( 1e09).toFixed(3, 1))+'G' }
            else if (v.lt(1e15))    { unit = 'Wei'; s = format(',.0f')(v.div( 1e09).toFixed(0, 1))+'G' } // RH uses nnn.nnnT. We prefer GWei over TWei
            else if (v.lt(1e18))    { unit = 'Wei'; s = format(',.3f')(v.div( 1e15).toFixed(3, 1))+'T' }
            else if (v.lt(1e21))    s = format(',.3f')(v.div( 1e18).toFixed(3, 1)) // nnn.nnn
            else if (v.lt(1e24))    s = format(',.0f')(v.div( 1e18).toFixed(0, 1)) // nnn,nnn
            else if (v.lt(1e27))    s = format(',.3f')(v.div( 1e24).toFixed(3, 1))+'M' // nnn.nnn M
            else if (v.lt(1e30))    s = format(',.0f')(v.div( 1e24).toFixed(3, 1))+'M' // nnn,nnn M
            else if (v.lt(1e33))    s = format(',.3f')(v.div( 1e30).toFixed(3, 1))+'B' // nnn.nnn B
            else if (v.lt(1e36))    s = format(',.0f')(v.div( 1e30).toFixed(0, 1))+'B' // nnn,nnn B
            else if (v.lt(1e39))    s = format(',.3f')(v.div( 1e36).toFixed(3, 1))+'T' // nnn.nnn T
            else                    s = format(',.0f')(v.div( 1e36).toFixed(0, 1))+'T' // [nnn,...,]nnn,nnn T
            break
        case 'SHARES_PER_HEX':
            unit = '/HEX'
            v = BigNumber(v).times(1e8)
            if (v.isZero())         s = '0.000'
            else if (v.lt( 1e3))    s = format(',.3f')(v.toFixed(3))
            else if (v.lt( 1e6))    s = format(',.3f')(v.div(1e3).toFixed(3, 1))+'K'
            else if (v.lt( 1e9))    s = format(',.3f')(v.div(1e6).toFixed(3, 1))+'M'
            else if (v.lt(1e12))    s = format(',.3f')(v.div(1e9).toFixed(3, 1))+'B'
            else                    s = format(',.0f')(v.div(1e9).toFixed(0))+'B'
            break
        case 'SHARES':
            unit = ' Shares'
            if (v.isZero())         s = '0.000'
            else if (v.lt( 1e3))    s = format(',.3f')(v.toFixed(3))
            else if (v.lt( 1e6))    s = format(',.3f')(v.div(1e3).toFixed(3, 1))+'K'
            else if (v.lt( 1e9))    s = format(',.3f')(v.div(1e6).toFixed(3, 1))+'M'
            else if (v.lt(1e12))    s = format(',.3f')(v.div(1e9).toFixed(3, 1))+'B'
            else                    s = format(',.0f')(v.div(1e9).toFixed(0))+'B'
            break
        case 'PERCENT': // where 1.0 = 1%
            unit = '%'
            v = BigNumber(v)
            if (v.isZero())         s = '0.000'
            else if (v.lt( 1e3))    s = format(',.3f')(v.toFixed(3, 1))
            else                    s = format(',.0f')(v.toFixed(0, 1))
            break
        case 'HEX': 
            if (v.isZero())         s = '0.000'
            else if (v.lt(1e5))     { unit = ' Hearts'; s = format(',.0f')(v.toFixed(0, 1)) }
            else if (v.lt(1e11))    s = format(',')(v.div( 1e08).toFixed(3, 1))
            else if (v.lt(1e14))    s = format(',')(v.div( 1e08).toFixed(0, 1))
            else if (v.lt(1e17))    s = format(',.3f')(v.div( 1e14).toFixed(3, 1))+'M'
            else if (v.lt(1e20))    s = format(',.3f')(v.div( 1e17).toFixed(3, 1))+'B'
            else if (v.lt(1e23))    s = format(',.3f')(v.div( 1e20).toFixed(3, 1))+'T'
            else                    s = format(',.0f')(v.div( 1e20).toFixed(0, 1))+'T'
            break
        default: // NaN or Infinity
            unit = ''
            s = v
    }
    return {
        valueString: s,
        unit,
        valueWithUnit: s + (unit === '' ? '' : ' '+unit)
    }
}

const detectedTrustWallet = (window.web3 && window.web3.currentProvider && window.web3.currentProvider.isTrust)

module.exports = {
    calcBigPayDaySlice,
    calcAdoptionBonus,
    cryptoFormat,
    detectedTrustWallet,
}
