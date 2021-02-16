// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

contract StakingTimelock is Ownable {
    using SafeMath for uint256;

    uint256 public duration = 1 days;

    struct StakingDetails {
        uint256 deadline;
        uint256 amount;
        uint256 updatedOn;
    }

    mapping(address => StakingDetails) public _stakingDetails;

    constructor(uint256 _duration) public {
        duration = _duration;
    }

    modifier checkLockDuration {
        StakingDetails storage _stakerDetails = _stakingDetails[msg.sender];

        require(_stakerDetails.deadline != 0);
        require(_stakerDetails.amount != 0);
        require(_stakerDetails.deadline + duration <= block.timestamp);
        _;
    }

    modifier checkLockDurationWithAmount(uint256 amount) {
        StakingDetails storage _stakerDetails = _stakingDetails[msg.sender];

        require(_stakerDetails.deadline != 0);
        require(_stakerDetails.amount <= amount);
        require(_stakerDetails.deadline + duration <= block.timestamp);
        _;
    }

    function getStakerDetails(address who)
        public
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        StakingDetails storage _stakerDetails = _stakingDetails[who];
        return (
            _stakerDetails.amount,
            _stakerDetails.deadline,
            _stakerDetails.updatedOn
        );
    }

    function getStakedAmount(address who) public view returns (uint256) {
        StakingDetails storage _stakerDetails = _stakingDetails[who];
        return _stakerDetails.amount;
    }

    function _updateStakerDetails(
        address who,
        uint256 _date,
        uint256 _amount
    ) internal returns (uint256, uint256) {
        StakingDetails storage _stakerDetails = _stakingDetails[who];
        _stakerDetails.deadline = _date;
        _stakerDetails.updatedOn = block.timestamp;
        _stakerDetails.amount = _amount;
    }

    function changeLockDuration(uint256 _duration) public onlyOwner {
        duration = _duration;
    }

    function getLockDuration() public view returns (uint256) {
        return duration;
    }
}
