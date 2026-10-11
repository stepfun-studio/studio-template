function animateCount(el, target, suffix = '') {
  const duration = 900
  const start = performance.now()
  const from = 0
  function frame(now) {
    const t = Math.min(1, (now - start) / duration)
    const eased = 1 - Math.pow(1 - t, 3)
    const value = Math.round(from + (target - from) * eased)
    el.textContent = `${value}${suffix}`
    if (t < 1) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

document.querySelectorAll('[data-count]').forEach(el => {
  const target = Number(el.dataset.count)
  const suffix = el.parentElement?.classList.contains('value') && el.nextElementSibling ? '' : ''
  animateCount(el, target, el.closest('.value')?.textContent?.includes('ms') ? '' : suffix)
})
