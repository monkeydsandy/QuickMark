function fuzzySearch(query, bookmarks) {
  const results = {};
  const lowercaseQuery = query.toLowerCase();

  for (const [date, urls] of Object.entries(bookmarks)) {
    const matchedUrls = urls.filter(url => 
      url.toLowerCase().includes(lowercaseQuery)
    );
    
    if (matchedUrls.length > 0) {
      results[date] = matchedUrls;
    }
  }

  return results;
}