import TaskQueue from '@/utils/taskQueue'

describe('test taskQueue', () => {
  jest.useFakeTimers()

  test('should work as expected', (done) => {
    const spy = jest.fn()
    const taskQueue = new TaskQueue(3, function () {
      expect(spy).toHaveBeenCalledTimes(10)
      done()
    })
    for (let i = 0; i < 10; i++) {
      taskQueue.push(new Promise(resolve => {
        setTimeout(resolve, 1000)
      }).then(() => spy()))
    }

    expect(spy).not.toBeCalled()

    expect(setTimeout).toHaveBeenCalledTimes(10)
    expect(taskQueue.running).toBe(3)

    jest.runAllTimers()
  })
})
