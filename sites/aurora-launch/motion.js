document.querySelectorAll('.btn.primary').forEach(btn => {
  btn.addEventListener('click', e => {
    if (btn.closest('form')) {
      e.preventDefault()
      btn.textContent = 'You\'re on the list'
      btn.disabled = true
    }
  })
})
