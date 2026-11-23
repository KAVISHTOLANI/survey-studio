import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('Survey Studio', () => {
  it('summarises the demo responses', () => {
    window.location.hash = '/survey/demo-workshop/results';
    render(<App />);
    expect(screen.getByText(/12 responses/)).toBeInTheDocument();
    expect(screen.getByText(/NPS · 5 promoters, 4 passives, 3 detractors|NPS ·/)).toBeInTheDocument();
    expect(screen.getByText('More time for the prototyping session, please.')).toBeInTheDocument();
  });

  it('validates required answers and saves a response', async () => {
    window.location.hash = '/survey/demo-workshop/take';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByText('3 questions need attention.')).toBeInTheDocument();
    await user.click(within(screen.getByRole('radiogroup', { name: 'How useful was the workshop overall?' })).getByLabelText('4'));
    await user.click(screen.getByLabelText('Writing clear briefs'));
    await user.click(within(screen.getByRole('radiogroup', { name: /recommend/ })).getByLabelText('9'));
    await user.click(screen.getByLabelText('Recorded videos'));
    await user.click(screen.getByLabelText('Written guides'));
    await user.click(screen.getByLabelText('Office hours'));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByText('Choose up to 2.')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Office hours'));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Thank you — response saved')).toBeInTheDocument();
    expect(screen.getByText(/now has 13 responses/)).toBeInTheDocument();
  });

  it('previews a draft without saving', async () => {
    window.location.hash = '/survey/demo-draft/take';
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText(/answers won’t be saved/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check answers' }));
    expect(await screen.findByText('Answers look good')).toBeInTheDocument();
  });

  it('builds a survey and blocks opening it with invalid questions', async () => {
    window.location.hash = '/surveys';
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('New survey title'), 'Lunch poll');
    await user.click(screen.getByRole('button', { name: 'Create survey' }));
    await user.click(await screen.findByRole('button', { name: '+ Single choice' }));
    await user.click(screen.getByRole('button', { name: 'Open for responses' }));
    expect(screen.getByText('Write the question.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Question 2 text'), 'Where should we eat?');
    await user.click(screen.getByRole('button', { name: 'Open for responses' }));
    expect(screen.getByText('Survey is open for responses.')).toBeInTheDocument();
  });
});
