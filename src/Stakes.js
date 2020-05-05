import React, { useState } from 'react'
import 'bootstrap/dist/css/bootstrap.min.css'
import { 
    Container,
    Card,
    Table,
    Row,
    Col,
    Button,
    Modal,
    Badge,
    Alert,
    OverlayTrigger,
    Tooltip
} from 'react-bootstrap'
import { FormattedDate } from 'react-intl';
import styles from './Stakes.css'
import { BigNumber } from 'bignumber.js'
import { format } from 'd3-format'

function hexFormat(v) {
    return format(v < 1e6 ? (v < 1e3 ? ",.3f" : ",.0f") : ",.5s")(v)
}

class Stakes extends React.Component {
    constructor(props) {
        super(props)
        this.contract = props.contract
        this.state = {
            address: props.walletAddress,
            contractData: props.contractData,
            stakeCount: null,
            stakeList:  null,
            stakedTotal: 0,
            sharesTotal: 0,
            poolShareTotal: 0, // note: not being displayed
            bpdTotal: 0,
            interestTotal: 0,
            stakeContext: { }, // active UI stake context
            showExitModal: false,
        }
    }

    calcBigPayDaySlice = (shares, pool) => {
        return Object.entries(this.state.contractData.globals).length 
            && new BigNumber(this.state.contractData.globals.claimStats.unclaimedSatoshisTotal).times(10000).times(shares).idiv(pool)
            || new BigNumber('fae0c6a6400dadc0', 16) // total claimable Satoshis
    }

    loadStakes() {
        console.log(this.state)
        this.contract.methods.stakeCount(this.state.address).call()
        .then((stakeCount) => {
            const currentDay = this.state.contractData.currentDay
            const globals = this.state.contractData.globals
            this.setState({
                stakeList: { },
                stakeCount: Number(stakeCount),
                stakedTotal: new BigNumber(0),
                sharesTotal: new BigNumber(0),
                poolShareTotal: new BigNumber(0),
                bpdTotal: new BigNumber(0),
                interestTotal: new BigNumber(0)
            })
            for (let index = 0; index < this.state.stakeCount; index++) {
                this.contract.methods.stakeLists(this.state.address, index).call()
                .then((data) => {
                    let stakeData = {
                        stakeId: data.stakeId,
                        lockedDay: Number(data.lockedDay),
                        stakedDays: Number(data.stakedDays),
                        stakedHearts: new BigNumber(data.stakedHearts),
                        stakeShares: new BigNumber(data.stakeShares),
                        unlockedDay: Number(data.unlockedDay),
                        isAutoStake: Boolean(data.isAutoStakte),
                        progress: Math.trunc(Math.min((currentDay - data.lockedDay) / data.stakedDays * 100000, 100000)),
                        poolShare: new BigNumber(data.stakeShares).div(globals.stakeSharesTotal),
                        bigPayDay: this.calcBigPayDaySlice(data.stakeShares, globals.stakeSharesTotal)
                    }
                    const stakeList = Object.assign({ }, this.state.stakeList)
                    stakeList[data.stakeId] = stakeData

                    // update this.state
                    this.setState({ 
                        stakeList,
                        stakedTotal: this.state.stakedTotal.plus(data.stakedHearts),
                        sharesTotal: this.state.sharesTotal.plus(data.stakeShares),
                        poolShareTotal: this.state.poolShareTotal.plus(stakeData.poolShare),
                    })

                    this.updateStakePayout(stakeData)
                })
            }
        })
        .catch(e => console.log('ERROR: Contract call - ',e))
    }

    updateStakePayout(_stakeData) {
        const CLAIM_PHASE_START_DAY = 1
        const CLAIM_PHASE_DAYS = 7 * 50
        const CLAIM_PHASE_END_DAY = CLAIM_PHASE_START_DAY + CLAIM_PHASE_DAYS
        const BIG_PAY_DAY = CLAIM_PHASE_END_DAY + 1
        const CLAIMABLE_BTC_ADDR_COUNT = new BigNumber('27997742')
        const CLAIMABLE_SATOSHIS_TOTAL = new BigNumber('910087996911001')
        const HEARTS_PER_SATOSHI = 10000
        const globals = this.state.contractData.globals 
        const claimedSatoshisTotal = new BigNumber(globals.claimStats.claimedSatoshisTotal)
        const unclaimedSatoshisTotal = new BigNumber(globals.claimStats.unclaimedSatoshisTotal)
        const claimedBtcAddrCount = new BigNumber(globals.claimStats.claimedBtcAddrCount)
        const stakeSharesTotal = new BigNumber(globals.stakeSharesTotal)
        const nextStakeSharesTotal = new BigNumber(globals.nextStakeSharesTotal)
        const currentDay = this.state.contractData.currentDay

        const stakeData = Object.assign({ }, _stakeData)
        const startDay = stakeData.lockedDay
        const endDay = startDay + stakeData.stakedDays

        this.contract.methods.dailyDataRange(startDay, Math.min(currentDay, endDay)).call()
        .then((dailyData) => {

            const calcAdoptionBonus = (bigPayDaySlice) => {
                const viral = bigPayDaySlice.times(claimedBtcAddrCount).idiv(CLAIMABLE_BTC_ADDR_COUNT)
                const criticalMass = bigPayDaySlice.times(claimedSatoshisTotal).idiv(CLAIMABLE_SATOSHIS_TOTAL)
                const bonus = viral.plus(criticalMass)
                return bonus
            }

            const calcDailyBonus = (shares, sharesTotal) => {
                // HEX mints 0.009955% daily interest (3.69%pa) and statkers get adoption bonuses from that each day
                const dailyInterest = new BigNumber(this.state.contractData.allocatedSupply).times(10000).idiv(100448995) // .sol line: 1243 
                const bonus = shares.times(dailyInterest.plus(calcAdoptionBonus(dailyInterest))).idiv(sharesTotal)
                return bonus
            }

            // iterate over daily payouts history
            stakeData.payout = new BigNumber(0)
            stakeData.bigPayDay = new BigNumber(0)

            dailyData.forEach((dailyDataMapping, dayNumber) => {
                // extract dailyData struct from uint256 mapping
                let hex = new BigNumber(dailyDataMapping).toString(16).padStart(64, '0')
                let dayPayoutTotal = new BigNumber(hex.slice(46,64), 16)
                let dayStakeSharesTotal = new BigNumber(hex.slice(28,46), 16)
                let dayUnclaimedSatoshisTotal = new BigNumber(hex.slice(12,28), 16)
                
                stakeData.payout = stakeData.payout.plus(dayPayoutTotal.times(stakeData.stakeShares).idiv(dayStakeSharesTotal))

                if (Number(startDay) <= BIG_PAY_DAY && Number(endDay) > BIG_PAY_DAY) {
                    const bigPaySlice = dayUnclaimedSatoshisTotal.times(HEARTS_PER_SATOSHI) .times(stakeData.stakeShares).idiv(stakeSharesTotal)
                    const bonuses = calcAdoptionBonus(bigPaySlice)
                    stakeData.bigPayDay = bigPaySlice.plus(bonuses)
                    if (startDay + dayNumber === BIG_PAY_DAY) stakeData.payout = stakeData.payout.plus(stakeData.bigPayDay.plus(bonuses))
                }

            })
            stakeData.payout = stakeData.payout.plus(calcDailyBonus(stakeData.stakeShares, stakeSharesTotal))

            const stakeList = Object.assign({ }, this.state.stakeList)
            stakeList[stakeData.stakeId] = stakeData

            this.setState({ 
                bpdTotal: this.state.bpdTotal.plus(stakeData.bigPayDay),
                interestTotal: this.state.interestTotal.plus(stakeData.payout),
                stakeList
            })
        })
    }

    componentDidMount() {
        this.loadStakes()
    }
    componentDidUpdate = (prevProps, prevState) => {
        if (prevProps.walletAddress != this.props.walletAddress) {
            this.setState(
                { address: this.props.walletAddress },
                this.loadStakes
            )
        }
    }

    render() {

        const currentDay = this.state.contractData.currentDay
        const globals = this.state.contractData.globals

        const handleClose = () => this.setState({ showExitModal: false })
        const handleShow = (stakeData) => {
            this.setState({
                stakeContext: stakeData,
                showExitModal: true
            })
        }
        const thisStake = this.state.stakeContext // if any
        const IsEarlyExit = (thisStake.stakeId && currentDay <= (thisStake.lockedDay + thisStake.stakedDays)) 

        return (
            <div>
            <Card bg="primary" text="light" className="overflow-auto m-2">
                <Card.Body className="p-2">
                    <Card.Title>Stakes <Badge variant='warning' className="float-right">Day {currentDay+1}</Badge></Card.Title>
                    <Table variant="secondary" size="sm" striped borderless>
                        <thead>
                            <tr>
                                <th className="day-value">Start</th>
                                <th className="day-value">End</th>
                                <th className="day-value">Days</th>
                                <th className="day-value">Progress</th>
                                <th className="hex-value">Principal</th>
                                <th className="shares-value">Shares</th>
                                <th className="hex-value">BigPayDay</th> 
                                <th className="hex-value">Interest</th>
                                <th>{' '}</th>
                            </tr>
                        </thead>
                        <tbody>
                            { this.state.stakeList &&
                                Object.keys(this.state.stakeList).map((key) => {
                                    const stakeData = this.state.stakeList[key]
                                    return (typeof stakeData === 'object') ? 
                                    (
                                        <tr key={stakeData.stakeId}>
                                            <td className="day-value">{stakeData.lockedDay + 1}</td>
                                            <td className="day-value">{
                                                <OverlayTrigger
                                                    key={stakeData.stakeId}
                                                    placement="top"
                                                    overlay={
                                                      <Tooltip id={'tooltip'+stakeData.stakeId}>
                                                        Full term is
                                                      </Tooltip>
                                                    }
                                                >
                                                <div>{stakeData.lockedDay + stakeData.stakedDays + 1}</div>
                                                </OverlayTrigger>
                                            }</td>
                                            <td className="day-value">{ stakeData.stakedDays }</td>
                                            <td className="day-value">
                                                { hexFormat(stakeData.progress / 1000) }%
                                            </td>
                                            <td className="hex-value">
                                                { hexFormat(stakeData.stakedHearts / 1e8)} 
                                            </td>
                                            <td className="shares-value">
                                                {hexFormat(stakeData.stakeShares)} 
                                            </td>
                                            <td className="hex-value">
                                                { hexFormat(stakeData.bigPayDay / 1e8) }
                                            </td>
                                            <td className="hex-value">
                                                { hexFormat(stakeData.payout / 1e8) }
                                            </td>
                                            <td align="right">
                                                <Button 
                                                    variant="outline-primary" size="sm" 
                                                    onClick={(e) => handleShow(stakeData, e)}
                                                    className={ 
            currentDay < (stakeData.lockedDay + stakeData.stakedDays / 2) ? "earlyexit"
                : currentDay < (stakeData.lockedDay + stakeData.stakedDays) ? "midexit"
                : currentDay < (stakeData.lockedDay + stakeData.stakedDays + 7) ? "termexit"
                : "lateexit"
                                                    }
                                                >
                                                    Exit
                                                </Button>
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr key={stakeData}><td colSpan="5">loading</td></tr>
                                    )
                                })
                            }
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan="4"></td>
                                <td className="hex-value">
                                    { hexFormat(this.state.stakedTotal / 1e8)} 
                                </td>
                                <td className="shares-value">
                                    { hexFormat(this.state.sharesTotal) }
                                </td>
                                <td className="hex-value">
                                    { hexFormat(this.state.bpdTotal / 1e8) }
                                </td>
                                <td className="hex-value">
                                    { hexFormat(this.state.interestTotal / 1e8) }
                                </td>
                                <td>{' '}</td>
                            </tr>
                        </tfoot>
                    </Table>
                </Card.Body>
            </Card>

            <Modal show={this.state.showExitModal} onHide={handleClose} animation={false}>
                <Modal.Header closeButton>
                    <Modal.Title>End Stake</Modal.Title>
                </Modal.Header>
               <Modal.Body>
                    {IsEarlyExit 
                        ?  
                            <Alert variant="danger">
                                <Alert.Heading>LOSSES AHEAD</Alert.Heading>
                                <p>
                                    Exiting stakes early can lead to <em>significant</em> losses!
                                </p>
                                <hr />
                                <p>
                                    <Alert.Link href="#">Learn more</Alert.Link>
                                </p>
                            </Alert>
                        :
                            <Alert variant="success">
                                <Alert.Heading>Term Complete</Alert.Heading>
                                <p>
                                    This stake has served its full term and is safe to exit.
                                </p>
                                <p> TODO: add stake stats / yield etc </p>
                            </Alert>
                    }
                </Modal.Body>
                <Modal.Footer>
                    {IsEarlyExit 
                        ? <div>
                            <Button variant="secondary" onClick={handleClose}>
                                Accept Penalty
                            </Button>
                            <Button variant="primary" className="ml-3" onClick={handleClose}>
                                Get me outta here!
                            </Button>
                        </div>
                        : <Button variant="primary" onClick={handleClose}>End Stake</Button>
                    }
                </Modal.Footer>
            </Modal>
            </div>
        )
    }
}

export default Stakes;
