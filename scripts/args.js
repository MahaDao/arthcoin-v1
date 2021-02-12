// module.exports = [
//   "0x6B175474E89094C44Da98b954EedeAC495271d0F",
//   "0x0E3cC2c4FB9252d17d07C67135E48536071735D9",
//   "0xE3D620Ca72FF970F5b36a2b2d51AfDBBDBCe59b5",
//   "0xB4d930279552397bbA2ee473229f89Ec245bc365",
//   "0x0f040ed37C0cAB55305dE16ADC6c8114E289942B",
//   "0xcd24eFb0F7285Cb923caB11a85fBdb1523f10011",
//   "0x977a86fAba6Ea1876c94e725a4E88E39DfAF3268",
//   "0xcD0eFae7FA77bFddA4e4997452F3DeB06F290a08",
//   "0xd5f501C4cDBFca915f04d4aE3853A904C9A35Af5",
//   "0x677d54d7DEf7Da25addE1827e000b81A65b1F408",
//   "0xdEc0b3bD49347c75fe1C44A219aB474a13e68FfD",
//   "0x5aC2A32BFa475765558CEa2A0Fe0bF0207D58Ca4",
//   "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
//   1611331200,
//   43200,
//   11
// ]

 const params = [
  '0x6B175474E89094C44Da98b954EedeAC495271d0F', // dai
  '0x0E3cC2c4FB9252d17d07C67135E48536071735D9', // cash
  '0xE3D620Ca72FF970F5b36a2b2d51AfDBBDBCe59b5', // bond
  '0xB4d930279552397bbA2ee473229f89Ec245bc365', // share

  '0x26ac78d87d2850f6db7ca48d68723702e79ea52f', // 1hr oracle
  '0xcd24eFb0F7285Cb923caB11a85fBdb1523f10011', // arth-maha oracle
  '0xc31b6dbf7bd28b822dd2e4413b5034bae3811888', // 12hr oracle
  '0xcD0eFae7FA77bFddA4e4997452F3DeB06F290a08', // gmu oracle

  // '0xd5f501c4cdbfca915f04d4ae3853a904c9a35af5', // arth uni liq boardroom
  // '0xd5f501c4cdbfca915f04d4ae3853a904c9a35af5', // arth mlp liq boardroom
  // '0x677d54d7DEf7Da25addE1827e000b81A65b1F408', // maha liq boardroom
  // '0xdEc0b3bD49347c75fe1C44A219aB474a13e68FfD', // arth boardroom
  // '0x5aC2A32BFa475765558CEa2A0Fe0bF0207D58Ca4', // ecosystem fund
  // '0x5aC2A32BFa475765558CEa2A0Fe0bF0207D58Ca4', // rainyday fund

  '0xCDcF57Dfa6eFd5862b0f8F37a611876CA4aad3f9', // uni router
  1611331200, // start time
  43200, // epoch
  41 // current epoch
]

module.exports = params

// npx hardhat verify --constructor-args scripts/args.js 0x2806e2e25480856432edB151e2975b6A49a5E079 --network mainnet
