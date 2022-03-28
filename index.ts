import fs from 'fs'
import { ethers } from 'ethers'
import { PNG } from 'pngjs'
import { NFTStorage, Blob } from 'nft.storage'
import ContractMetadata from './contract-metadata.json'

const publicFolder = 'public'
const cacheFilePath = `${publicFolder}/cache.json`
const canvasNftFolder = `${publicFolder}/canvasNFT`
const contractAddress = '0x01419A742Ec2675c7d65e5f3104ef632bb957851'
const contractCreationTimestamp = 1643649762
const canvasWidth = 256
const canvasHeight = 256

const colors = [
  { hex: '#000000', r: 0x00, g: 0x00, b: 0x00, name: 'Black' },
  { hex: '#1D2B53', r: 0x1D, g: 0x2B, b: 0x53, name: 'Dark Blue' },
  { hex: '#7E2553', r: 0x7E, g: 0x25, b: 0x53, name: 'Dark Purple' },
  { hex: '#008751', r: 0x00, g: 0x87, b: 0x51, name: 'Dark Green' },
  { hex: '#AB5236', r: 0xAB, g: 0x52, b: 0x36, name: 'Brown' },
  { hex: '#5F574F', r: 0x5F, g: 0x57, b: 0x4F, name: 'Dark Grey' },
  { hex: '#C2C3C7', r: 0xC2, g: 0xC3, b: 0xC7, name: 'Light Grey' },
  { hex: '#FFF1E8', r: 0xFF, g: 0xF1, b: 0xE8, name: 'White' },
  { hex: '#FF004D', r: 0xFF, g: 0x00, b: 0x4D, name: 'Red' },
  { hex: '#FFA300', r: 0xFF, g: 0xA3, b: 0x00, name: 'Orange' },
  { hex: '#FFEC27', r: 0xFF, g: 0xEC, b: 0x27, name: 'Yellow' },
  { hex: '#00E436', r: 0x00, g: 0xE4, b: 0x36, name: 'Green' },
  { hex: '#29ADFF', r: 0x29, g: 0xAD, b: 0xFF, name: 'Blue' },
  { hex: '#83769C', r: 0x83, g: 0x76, b: 0x9C, name: 'Lavender' },
  { hex: '#FF77A8', r: 0xFF, g: 0x77, b: 0xA8, name: 'Pink' },
  { hex: '#FFCCAA', r: 0xFF, g: 0xCC, b: 0xAA, name: 'Light Peach' }
]

type Cache = {
  blockNumber: number,
  pixels: number[]
}

const pixelsAbi = ContractMetadata.output.abi

const provider = ethers.getDefaultProvider(4)
const pixelsContract = new ethers.Contract(contractAddress, pixelsAbi, provider)

async function run() {
  console.log('== Starting cache update ==')

  fs.mkdirSync(publicFolder, { recursive: true })
  fs.mkdirSync(canvasNftFolder, { recursive: true })

  let cache: Cache = {
    blockNumber: 0, pixels: []
  }

  if (fs.existsSync(cacheFilePath)) {
    cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'))
  } else {
    console.log('Cache not found! Creating new one.')

    cache = { blockNumber: 0, pixels: new Array(canvasWidth * canvasHeight).fill(0) }
  }

  const cacheBlockNumber = cache.blockNumber
  const currentBlockNumber = await provider.getBlockNumber()

  const pixelsChangedFilter = pixelsContract.filters.PixelsChanged()
  const events = await pixelsContract.queryFilter(pixelsChangedFilter, cacheBlockNumber, currentBlockNumber)

  let cacheDay = await blockNumberToDay(cacheBlockNumber)
  let currentDay = await blockNumberToDay(currentBlockNumber)

  console.log(`Pixel changes between block number ${cacheBlockNumber} and ${currentBlockNumber}:`)

  for (const event of events) {
    if (!event.removed) {
      if (event.args != null) {
        const eventDay = blockToDay(await event.getBlock())

        if (eventDay != cacheDay) {
          for (let day = cacheDay; day < eventDay; day++) {
            console.log(`Generating canvas NFT for day ${day}!`)
            await generateCanvasNFT(cache.pixels, day)
          }
        }

        const colors = ethers.utils.arrayify(event.args.colors)

        for (let i = 0; i < event.args.pixelsToken.length; i++) {
          const pixel = event.args.pixelsToken[i].toNumber()
          const color = colors[i]

          cache.pixels[pixel] = color

          console.log(`Pixel ${pixel} set to color ${color}`)
        }

        cacheDay = eventDay
      }
    }
  }

  if (cacheDay != currentDay) {
    for (let day = cacheDay; day < currentDay; day++) {
      console.log(`Generating canvas NFT for day ${day}!`)
      await generateCanvasNFT(cache.pixels, day)
    }
  }

  cache.blockNumber = currentBlockNumber

  fs.writeFileSync(cacheFilePath, JSON.stringify(cache))

  console.log('== Finished cache update ==')

  process.exit(0)
}

async function generateCanvasNFT(pixels, day) {
  const image = new PNG({ width: canvasWidth, height: canvasHeight })

  let i = 0
  for (let pixel = 0; pixel < canvasWidth * canvasHeight; pixel++) {
    const color = colors[pixels[pixel]]

    image.data[i++] = color.r
    image.data[i++] = color.g
    image.data[i++] = color.b
    image.data[i++] = 0xff
  }

  const imageBytes = PNG.sync.write(image)

  fs.writeFileSync(`${canvasNftFolder}/${day}-image.png`, imageBytes)

  const storage = new NFTStorage({ token: process.env.NFT_STORAGE_TOKEN })
  const imageHash = await storage.storeBlob(new Blob([imageBytes]))

  const name = `Pixels Day #${day}`
  const imageUri = `ipfs://${imageHash}`

  const metadata =
    `{
  "name": "${name}",
  "description": "The pixels daily snapshot",
  "image_data": "${imageUri}"
}`

  fs.writeFileSync(`${canvasNftFolder}/${day}-metadata.json`, metadata)

  const metadataHash = await storage.storeBlob(new Blob([metadata]))

  fs.writeFileSync(`${canvasNftFolder}/${day}-metadata-ipfs.txt`, `ipfs://${metadataHash}`)
}

async function blockNumberToDay(blockNumber) {
  return blockToDay(await provider.getBlock(blockNumber))
}

function blockToDay(block: ethers.providers.Block) {
  return timestampToDay(block.timestamp)
}

function timestampToDay(timestamp: number) {
  return Math.max(Math.floor((timestamp - contractCreationTimestamp) / (60 * 60 * 24)) + 1, 0)
}
run()
