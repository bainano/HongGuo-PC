import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';
import './styles/nav.css';
import './styles/banner.css';
import './styles/sections.css';
import './styles/category.css';
import './styles/rank.css';
import './styles/detail.css';
import './styles/player.css';
import './styles/search.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
