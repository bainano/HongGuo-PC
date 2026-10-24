function f(t){if(isNaN(t)||t<0)return"00:00";const r=Math.floor(t/60),a=Math.floor(t%60);return`${String(r).padStart(2,"0")}:${String(a).padStart(2,"0")}`}export{f};
