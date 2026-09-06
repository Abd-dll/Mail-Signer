// ============================================================
// normalize.js — Standardisation des chaînes de caractères
// ============================================================

function normalize(text){
  text = String(text);
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/\r/g, "\n");
  
  const lines = text.split("\n");
  for (let i=0;i<lines.length;i++){
    lines[i]=lines[i].trim();
  }
  
  text = lines.join("\n").trim();
  return text;
}

module.exports={normalize};