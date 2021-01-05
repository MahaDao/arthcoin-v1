// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

import '../interfaces/IGMUOracle.sol';

contract GMUOracle is Ownable, IGMUOracle {
    using SafeMath for uint256;

    uint256 public price;

    constructor() public {
        // Set the initial price to 1.05.
        price = uint256(1e18);
    }

    function setPrice(uint256 _price) public override onlyOwner {
        price = _price;
    }

    function getPrice() public view override returns (uint256) {
        return price;
    }

    function consult(uint256 amountIn)
        external
        view
        override
        returns (uint256)
    {
        return price.mul(amountIn).div(1e18);
    }

    event Updated(uint256 price0CumulativeLast, uint256 price1CumulativeLast);
}
