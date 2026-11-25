import { generateIpog } from './ipog-algorithm.mjs'

self.addEventListener('message', (event) => {
  const { parameters, strength } = event.data
  void generateIpog(parameters, strength, (progress) => {
    self.postMessage({ type: 'progress', ...progress })
  }).then((tests) => {
    self.postMessage({ type: 'complete', tests })
  }).catch((error) => {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'IPOG výpočet selhal.',
    })
  })
})
