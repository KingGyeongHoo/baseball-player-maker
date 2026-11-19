import {useId} from 'react';

export default function Ballpark({showCaption=true,stretch=false}:{showCaption?:boolean;stretch?:boolean}) {
  const id=useId(),grass=`${id}-grass`,territory=`${id}-territory`;
  return <svg viewBox="0 0 600 500" preserveAspectRatio={stretch?'none':undefined} className="selection-ballpark" aria-hidden="true">
    <defs>
      <pattern id={grass} width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="40" height="80" fill="#fff" fillOpacity=".035" /></pattern>
      <clipPath id={territory}><path d="M300 450 28.47 178.47A384 384 0 0 1 571.53 178.47Z" /></clipPath>
    </defs>
    <path d="M300 465 12.16 177.16A407 407 0 0 1 587.84 177.16Z" fill="#c4a078" />
    <path d="M300 450 28.47 178.47A384 384 0 0 1 571.53 178.47Z" fill="#507b5b" />
    <path d="M300 450 28.47 178.47A384 384 0 0 1 571.53 178.47Z" fill={`url(#${grass})`} />
    <path d="M300 440 137.37 277.37A230 230 0 0 1 462.63 277.37Z" fill="#c4a078" />
    <path d="m300 419-89-89 89-89 89 89Z" fill="#507b5b" />
    <path d="m300 450-271.53-271.53M300 450l271.53-271.53" stroke="#f8f6ea" strokeWidth="3.5" />
    <path d="m300 440-110-110 110-110 110 110Z" stroke="#f8f6ea" strokeOpacity=".75" strokeWidth="2" fill="none" />
    <circle cx="300" cy="330" r="17" fill="#c4a078" /><rect x="294" y="326" width="12" height="3" rx="1" fill="#fffdf1" />
    <circle cx="300" cy="439" r="25" fill="#c4a078" />
    {[[190,330],[300,220],[410,330]].map(([x,y])=><rect key={x} x={x-5} y={y-5} width="10" height="10" fill="#fffdf1" transform={`rotate(45 ${x} ${y})`} />)}
    <path d="M294 438h12v7l-6 5-6-5Z" fill="#fffdf1" />
    <path d="M275 431h9v18h-9Zm41 0h9v18h-9Z" stroke="#f8f6ea" strokeWidth="1.4" fill="none" />
    <path d="M300 450 5 155M300 450 595 155" stroke="#fff" strokeOpacity=".18" strokeWidth="1" strokeDasharray="3 5" clipPath={`url(#${territory})`} />
    {showCaption&&<text x="300" y="81" textAnchor="middle" fill="#e1eadf" fillOpacity=".6" fontFamily="Arial,sans-serif" fontSize="9" letterSpacing="3">FIND YOUR PLACE</text>}
  </svg>;
}
