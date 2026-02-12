async function main(): Promise<void> {
  console.log('No extension tests configured.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
