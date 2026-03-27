import { Readability } from '@mozilla/readability';

function extractContent() {
  // Clone the document to avoid modifying the actual page
  const documentClone = document.cloneNode(true) as Document;
  
  const reader = new Readability(documentClone);
  const article = reader.parse();
  
  if (article && article.textContent && article.textContent.trim().length > 0) {
    return {
      title: article.title,
      content: article.textContent,
      url: window.location.href
    };
  }
  
  return {
    title: document.title,
    content: document.body.innerText,
    url: window.location.href
  };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'EXTRACT_CONTENT') {
    const content = extractContent();
    sendResponse(content);
  }
  return true;
});
