const path = require('path')
const chalk = require('chalk')
const fs = require('fs-extra')
const { exec, log } = require('../lib')

// start configuration
const tempFolder = path.join(__dirname, '.tmp')
const sourceRepo = 'https://github.com/qualipool/swissrets.wiki.git'
const sourceFolderName = 'source'
const destinationFolderName = 'dest'
// end configuration

const loudExecConfig = {
  stdio: 'inherit',
  printCommand: true
}

const addToken = (url, token) => url
  .replace(/^git/, token)
  .replace(/^https:\/\/github/, `https://${token}@github`)

// sanitized git-clone for not showing access tokens
const clone = async (repoUrl, folder, branch, token) => {
  log.info(`Cloning ${chalk.cyan(repoUrl)} into ${chalk.cyan(folder)}`)

  // use authentication
  if (token) {
    log.info(`Using token`)
    repoUrl = addToken(repoUrl, token)
  }

  // catch errors and remove sensisitve information
  return exec(`git clone -b ${branch} ${repoUrl} ${folder}`)
    .catch(err => {
      log.warn(err.result.stderr)
      return Promise.reject(new Error(err.message))
    })
}

// sanitized git-push for not showing access tokens
const push = async (repoUrl, token) => {
  log.info(`Pushing changes to ${chalk.cyan(repoUrl)}`)

  // use authentication
  if (token) {
    log.info(`Using token`)
    repoUrl = addToken(repoUrl, token)
  }

  // catch errors and remove sensisitve information
  return exec(`git push ${repoUrl}`)
    .catch(err => {
      log.warn(err.result.stderr)
      return Promise.reject(new Error(err.message))
    })
}

const update = async () => {
  const token = process.env.GITHUB_ACCESS_TOKEN

  // change to temporary directory
  await fs.remove(tempFolder)
  await fs.ensureDir(tempFolder)

  // change to temp dir
  process.chdir(tempFolder)

  // download repo
  await clone(sourceRepo, sourceFolderName, 'master', token)
  const sourceFolder = path.join(tempFolder, sourceFolderName)

  const destinationRepo = await exec(`git config --get remote.origin.url`)
  await clone(destinationRepo, destinationFolderName, 'gh-pages')
  const destinationFolder = path.join(tempFolder, destinationFolderName)

  const indexFileSrc = path.join(sourceFolder, 'Home.md')
  const indexFileDest = path.join(destinationFolder, 'index.md')
  const updateFile = path.join(destinationFolder, 'UPDATED.md')

  // remove old posts folder and copy everything from source to destination
  await fs.copy(indexFileSrc, indexFileDest)
  await fs.copy(sourceFolder, destinationFolder, {
    filter: (source, dest) =>
      !source.replace(sourceFolder, '').match('.git') &&
      !source.match(indexFileSrc) &&
      dest.match(/\.md$/)
  })
  await fs.writeFile(updateFile, (new Date()).toISOString())

  // // commit changes
  process.chdir(destinationFolder)
  await exec(`git add -A *.md`, loudExecConfig)
  try {
    await exec('git commit -m "Updating posts from wiki pages"', loudExecConfig)
    await push(destinationRepo, token)
  } catch (e) {
    log.info(e)
  }
}

update()

// make sure, we're exit with code:1 for undhandled rejections
process.on('unhandledRejection', error => {
  log.failure(error.message, '\nDetails:\n', error, '\n\n')
  process.exitCode = 1
})
