// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '../core/VestedVaultBoardroom.sol';

contract ArthArthBoardroomV2 is VestedVaultBoardroom {
    constructor(
        IERC20 cash_,
        Vault vault_,
        uint256 vestFor_
    ) public VestedVaultBoardroom(cash_, vault_, vestFor_) {}
}
