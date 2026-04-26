import{ab as S,a3 as R,aE as Y,D as tt,n as et,o as at,s as rt,g as nt,c as it,b as st,_ as g,l as W,v as ot,d as lt,E as ct,I as ut,P as pt,k as gt}from"./index-CG0GqMXC.js";import{p as dt}from"./chunk-4BX2VUAB-DrloMDvn.js";import{p as ft}from"./wardley-RL74JXVD-DO9ELlLM.js";import{d as _}from"./arc-CRm7QU2W.js";import{o as ht}from"./ordinal-Cboi1Yqb.js";import"./min-BLhJxQpc.js";import"./_baseUniq-q0E7p-7u.js";import"./init-Gi6I4Gst.js";function mt(t,a){return a<t?-1:a>t?1:a>=t?0:NaN}function vt(t){return t}function xt(){var t=vt,a=mt,f=null,y=S(0),s=S(R),d=S(0);function o(e){var n,l=(e=Y(e)).length,c,h,v=0,u=new Array(l),i=new Array(l),x=+y.apply(this,arguments),w=Math.min(R,Math.max(-R,s.apply(this,arguments)-x)),m,C=Math.min(Math.abs(w)/l,d.apply(this,arguments)),$=C*(w<0?-1:1),p;for(n=0;n<l;++n)(p=i[u[n]=n]=+t(e[n],n,e))>0&&(v+=p);for(a!=null?u.sort(function(A,D){return a(i[A],i[D])}):f!=null&&u.sort(function(A,D){return f(e[A],e[D])}),n=0,h=v?(w-l*$)/v:0;n<l;++n,x=m)c=u[n],p=i[c],m=x+(p>0?p*h:0)+$,i[c]={data:e[c],index:n,value:p,startAngle:x,endAngle:m,padAngle:C};return i}return o.value=function(e){return arguments.length?(t=typeof e=="function"?e:S(+e),o):t},o.sortValues=function(e){return arguments.length?(a=e,f=null,o):a},o.sort=function(e){return arguments.length?(f=e,a=null,o):f},o.startAngle=function(e){return arguments.length?(y=typeof e=="function"?e:S(+e),o):y},o.endAngle=function(e){return arguments.length?(s=typeof e=="function"?e:S(+e),o):s},o.padAngle=function(e){return arguments.length?(d=typeof e=="function"?e:S(+e),o):d},o}var V=tt.pie,z={sections:new Map,showData:!1,config:V},T=z.sections,F=z.showData,St=structuredClone(V),yt=g(()=>structuredClone(St),"getConfig"),wt=g(()=>{T=new Map,F=z.showData,ot()},"clear"),At=g(({label:t,value:a})=>{if(a<0)throw new Error(`"${t}" has invalid value: ${a}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);T.has(t)||(T.set(t,a),W.debug(`added new section: ${t}, with value: ${a}`))},"addSection"),Dt=g(()=>T,"getSections"),Ct=g(t=>{F=t},"setShowData"),$t=g(()=>F,"getShowData"),U={getConfig:yt,clear:wt,setDiagramTitle:et,getDiagramTitle:at,setAccTitle:rt,getAccTitle:nt,setAccDescription:it,getAccDescription:st,addSection:At,getSections:Dt,setShowData:Ct,getShowData:$t},Tt=g((t,a)=>{dt(t,a),a.setShowData(t.showData),t.sections.map(a.addSection)},"populateDb"),Et={parse:g(async t=>{const a=await ft("pie",t);W.debug(a),Tt(a,U)},"parse")},bt=g(t=>`
  .pieCircle{
    stroke: ${t.pieStrokeColor};
    stroke-width : ${t.pieStrokeWidth};
    opacity : ${t.pieOpacity};
  }
  .pieOuterCircle{
    stroke: ${t.pieOuterStrokeColor};
    stroke-width: ${t.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${t.pieTitleTextSize};
    fill: ${t.pieTitleTextColor};
    font-family: ${t.fontFamily};
  }
  .slice {
    font-family: ${t.fontFamily};
    fill: ${t.pieSectionTextColor};
    font-size:${t.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${t.pieLegendTextColor};
    font-family: ${t.fontFamily};
    font-size: ${t.pieLegendTextSize};
  }
`,"getStyles"),kt=bt,Mt=g(t=>{const a=[...t.values()].reduce((s,d)=>s+d,0),f=[...t.entries()].map(([s,d])=>({label:s,value:d})).filter(s=>s.value/a*100>=1);return xt().value(s=>s.value).sort(null)(f)},"createPieArcs"),Rt=g((t,a,f,y)=>{var I;W.debug(`rendering pie chart
`+t);const s=y.db,d=lt(),o=ct(s.getConfig(),d.pie),e=40,n=18,l=4,c=450,h=c,v=ut(a),u=v.append("g");u.attr("transform","translate("+h/2+","+c/2+")");const{themeVariables:i}=d;let[x]=pt(i.pieOuterStrokeWidth);x??(x=2);const w=o.textPosition,m=Math.min(h,c)/2-e,C=_().innerRadius(0).outerRadius(m),$=_().innerRadius(m*w).outerRadius(m*w);u.append("circle").attr("cx",0).attr("cy",0).attr("r",m+x/2).attr("class","pieOuterCircle");const p=s.getSections(),A=Mt(p),D=[i.pie1,i.pie2,i.pie3,i.pie4,i.pie5,i.pie6,i.pie7,i.pie8,i.pie9,i.pie10,i.pie11,i.pie12];let E=0;p.forEach(r=>{E+=r});const G=A.filter(r=>(r.data.value/E*100).toFixed(0)!=="0"),b=ht(D).domain([...p.keys()]);u.selectAll("mySlices").data(G).enter().append("path").attr("d",C).attr("fill",r=>b(r.data.label)).attr("class","pieCircle"),u.selectAll("mySlices").data(G).enter().append("text").text(r=>(r.data.value/E*100).toFixed(0)+"%").attr("transform",r=>"translate("+$.centroid(r)+")").style("text-anchor","middle").attr("class","slice");const j=u.append("text").text(s.getDiagramTitle()).attr("x",0).attr("y",-(c-50)/2).attr("class","pieTitleText"),L=[...p.entries()].map(([r,M])=>({label:r,value:M})),k=u.selectAll(".legend").data(L).enter().append("g").attr("class","legend").attr("transform",(r,M)=>{const O=n+l,J=O*L.length/2,K=12*n,Q=M*O-J;return"translate("+K+","+Q+")"});k.append("rect").attr("width",n).attr("height",n).style("fill",r=>b(r.label)).style("stroke",r=>b(r.label)),k.append("text").attr("x",n+l).attr("y",n-l).text(r=>s.getShowData()?`${r.label} [${r.value}]`:r.label);const X=Math.max(...k.selectAll("text").nodes().map(r=>(r==null?void 0:r.getBoundingClientRect().width)??0)),Z=h+e+n+l+X,N=((I=j.node())==null?void 0:I.getBoundingClientRect().width)??0,q=h/2-N/2,H=h/2+N/2,P=Math.min(0,q),B=Math.max(Z,H)-P;v.attr("viewBox",`${P} 0 ${B} ${c}`),gt(v,c,B,o.useMaxWidth)},"draw"),Wt={draw:Rt},_t={parser:Et,db:U,renderer:Wt,styles:kt};export{_t as diagram};
