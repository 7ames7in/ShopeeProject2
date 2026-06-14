import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('Button Component Examples', () => {
  it('should render button with text', () => {
    const TestButton = () => <button>Click me</button>
    render(<TestButton />)
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
  })

  it('should handle button click', async () => {
    const handleClick = () => {}
    const user = userEvent.setup()
    
    const TestButton = () => <button onClick={handleClick}>Click</button>
    render(<TestButton />)
    
    const button = screen.getByRole('button')
    await user.click(button)
    expect(button).toBeInTheDocument()
  })

  it('should render disabled button', () => {
    const TestButton = () => <button disabled>Disabled</button>
    render(<TestButton />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
