const nodes = document.querySelectorAll('.case, .essay, .contact')
nodes.forEach(n => n.classList.add('reveal'))
const io = new IntersectionObserver(
  entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible')
        io.unobserve(e.target)
      }
    })
  },
  { threshold: 0.15 }
)
nodes.forEach(n => io.observe(n))
