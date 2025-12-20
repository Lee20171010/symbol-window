import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import RelationApp from './RelationApp';
import '../../style.css';

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<RelationApp />);
}
