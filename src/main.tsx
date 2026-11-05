import { createRoot } from 'react-dom/client';
import App from './App.tsx';
// @ts-ignore CSS is loaded by the bundler; TypeScript has no declaration for it.
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
