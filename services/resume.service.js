// Resume Analysis Service
export function analyzeSection(section, data) { return { completeness: 50, quality: 50, missing: [], suggestions: [], score: 50 }; }
export function getSuggestions(section) { return []; }
export const actionVerbs = { leadership: ["Led", "Directed"], technical: ["Developed", "Designed"], impact: ["Increased", "Improved"] }; 
export default { analyzeSection, getSuggestions, actionVerbs };
