// Background script to handle extension icon clicks
export {}

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    // Toggle sidebar visibility by sending message to content script
    chrome.tabs.sendMessage(tab.id, { action: "toggle-sidebar" }).catch((error) => {
      // Handle error if content script is not ready or tab doesn't support it
      console.error("Error sending message to content script:", error)
    })
  }
})

// Background script only handles sidebar toggle now
// Video stream detection and screenshot capture happens in content script

