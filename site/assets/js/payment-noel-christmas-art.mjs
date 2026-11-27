// Original compact vector Christmas ornaments, no external fonts or requests.
export const christmasItems=[["nutcracker","","classic","Lính chì","Nutcracker","胡桃夹子","noel_custom"],["rocking_horse","","classic","Ngựa gỗ","Rocking horse","摇马","noel_custom"],["angel_gold","","classic","Thiên thần vàng","Golden angel","金天使","noel_custom"],["double_bells","","classic","Chuông đôi","Double bells","双铃","noel_custom"],["noel_wreath","","classic","Vòng nguyệt quế","Christmas wreath","圣诞花环","noel_custom"],["vintage_bauble","","classic","Châu cổ điển","Vintage bauble","复古挂球","noel_custom"],["ginger_house","","classic","Nhà bánh gừng","Gingerbread house","姜饼屋","noel_custom"],["peppermint","","classic","Kẹo bạc hà","Peppermint","薄荷糖","noel_custom"],["yule_log","","classic","Bánh khúc cây","Yule log","树桩蛋糕","noel_custom"],["stocking_embro","","classic","Tất thêu","Embroidered stocking","刺绣袜","noel_custom"],["ginger_person","","classic","Người bánh gừng","Gingerbread person","姜饼人","noel_custom"],["noel_cupcake","","classic","Cupcake Noel","Christmas cupcake","圣诞纸杯蛋糕","noel_custom"],["crystal_drop","","classic","Giọt pha lê","Crystal drop","水晶坠","noel_custom"],["jewel_star","","classic","Sao đính đá","Jeweled star","宝石星","noel_custom"],["gold_pendant","","classic","Mặt dây vàng","Gold pendant","金吊坠","noel_custom"],["pearl_garland","","classic","Dây ngọc trai","Pearl garland","珍珠链","noel_custom"],["glass_bell","","classic","Chuông thủy tinh","Glass bell","玻璃铃","noel_custom"],["ice_icicle","","classic","Tinh thể băng","Icicle","冰柱","noel_custom"],["tiger_noel","","classic","Hổ Noel","Santa tiger","圣诞虎","noel_custom"],["cat_scarf","","classic","Mèo khăn len","Scarf cat","围巾猫","noel_custom"],["dachshund_noel","","classic","Chó áo đỏ","Christmas dachshund","圣诞腊肠犬","noel_custom"],["rabbit_deer","","classic","Thỏ tuần lộc","Reindeer bunny","驯鹿兔","noel_custom"],["polar_bow","","classic","Gấu tuyết nơ","Polar bear bow","蝴蝶结北极熊","noel_custom"],["penguin_scarf","","classic","Cánh cụt khăn len","Scarf penguin","围巾企鹅","noel_custom"]];
export function christmasArt(kind,doc=document){
 const ns="http://www.w3.org/2000/svg",s=doc.createElementNS(ns,"svg");s.setAttribute("viewBox","0 0 64 64");s.setAttribute("class","nt-sticker-svg");s.setAttribute("aria-hidden","true");
 const add=(tag,a)=>{const e=doc.createElementNS(ns,tag);for(const [k,v] of Object.entries(a))e.setAttribute(k,String(v));s.append(e);return e};
 const p=(d,fill,stroke="#825044",w=1.4)=>add("path",{d,fill,stroke,"stroke-width":w,"stroke-linecap":"round","stroke-linejoin":"round"}),r=(x,y,width,height,rx,fill,stroke="none")=>add("rect",{x,y,width,height,rx,fill,stroke}),o=(cx,cy,r,fill,stroke="none")=>add("circle",{cx,cy,r,fill,stroke}),e=(cx,cy,rx,ry,fill)=>add("ellipse",{cx,cy,rx,ry,fill});
 const gold="#c99b48",red="#b83f48",cream="#fff3df",green="#356f54",pink="#ed9eae",ice="#c5e8f4";
 const cap=()=>{r(27,5,10,7,2,gold);p("M29 5 Q32 -1 35 5","none",gold,2)};
 const bow=(x=32,y=36,col=red)=>{p("M"+x+" "+y+" q-17 -13 -17 0 q0 10 17 2 q17 8 17 -2 q0 -13 -17 0Z",col,"#8d4550");o(x,y,4,cream)};
 const star=(x=32,y=33,col=gold)=>p("M"+x+" "+(y-23)+" l6 16 17 1 -13 11 5 17 -15 -10 -15 10 5 -17 -13 -11 17 -1Z",col,"#e4bb70",1.6);
 const face=(col)=>{e(32,35,20,18,col);o(24,34,2.6,"#533d3a");o(40,34,2.6,"#533d3a");p("M29 42 Q32 46 35 42","none","#533d3a");o(32,39,2.4,"#b67a70")};
 const hat=()=>{p("M15 22 Q18 2 37 7 Q46 9 48 18 L40 20 Q35 9 33 17Z",red);r(13,18,32,7,3,cream);o(48,18,5,cream)};
 const scarf=()=>{r(12,47,40,8,3,red);p("M39 51 H47 V62 L39 59Z",red);for(let x=17;x<49;x+=9)r(x,48,3,7,1,gold)};
 const bell=(x,y,col)=>{p("M"+(x-11)+" "+(y+13)+" Q"+(x-7)+" "+(y+8)+" "+(x-7)+" "+y+" Q"+(x)+" "+(y-16)+" "+(x+7)+" "+y+" Q"+(x+7)+" "+(y+8)+" "+(x+11)+" "+(y+13)+"Z",col,gold);o(x,y+15,3,gold)};
 switch(kind){
 case "nutcracker":r(18,4,28,15,2,"#344663",gold);r(22,17,20,15,3,cream);o(27,23,2,"#46332c");o(37,23,2,"#46332c");r(22,29,20,20,2,red,gold);r(19,49,11,11,2,"#344663");r(34,49,11,11,2,"#344663");for(let y=33;y<47;y+=6)r(25,y,14,2,1,gold);break;
 case "rocking_horse":p("M15 45 L20 23 32 26 37 12 48 13 52 24 42 28 43 44 H35 L32 35 H25 L23 45Z","#bd8657");p("M9 49 Q32 62 55 49","none",gold,4);r(26,26,13,7,2,red);o(46,18,2,"#533d3a");break;
 case "angel_gold":e(18,32,13,19,"#f3d99e");e(46,32,13,19,"#f3d99e");p("M32 22 L15 57 H49Z",cream,gold);o(32,15,10,"#eac29c");e(32,3,12,2,gold);p("M23 13 Q32 1 41 13","none",gold,4);break;
 case "double_bells":bell(21,31,"#e9bb55");bell(43,31,"#f3d081");bow(32,17);break;
 case "noel_wreath":o(32,32,22,green);o(32,32,12,"#fff0d900");for(let i=0;i<12;i++){const a=i*Math.PI/6;o(32+19*Math.cos(a),32+19*Math.sin(a),5,i%3?"#599476":red)}o(32,32,11,"#fff");bow(32,49);break;
 case "vintage_bauble":cap();o(32,34,23,red,gold);p("M10 33 Q32 9 54 33 Q32 56 10 33Z",cream,gold);for(let x=17;x<55;x+=10)o(x,33,3,gold);break;
 case "ginger_house":r(11,27,42,32,3,"#ad7652");p("M5 29 L32 6 59 29 52 33 32 17 12 33Z",cream);r(26,38,13,21,4,"#8e5345",cream);r(15,36,9,10,2,pink,cream);r(42,36,9,10,2,pink,cream);break;
 case "peppermint":o(32,32,25,cream,red);for(let i=0;i<6;i++){const a=i*Math.PI/3;let x=32+24*Math.cos(a),y=32+24*Math.sin(a),xx=32+24*Math.cos(a+.38),yy=32+24*Math.sin(a+.38);p("M32 32 Q"+x+" "+y+" "+xx+" "+yy+" A24 24 0 0 0 "+x+" "+y+"Z",red,"none")}break;
 case "yule_log":r(9,22,43,31,9,"#86503e");e(49,37,11,15,"#d8aa79");p("M49 29 q-9 0 -5 10 q10 9 11 -2","none","#8c5341",3);p("M12 26 Q24 19 36 26","none",cream,4);o(25,18,5,red);break;
 case "stocking_embro":p("M25 11 H48 L46 35 Q60 49 48 57 Q28 64 10 48 Q8 38 24 39Z",red,gold);r(22,7,28,12,3,cream);p("M30 25 l6 12 6 -12 M30 31 H42","none",gold,2);break;
 case "ginger_person":o(32,15,11,"#b87b50");p("M24 24 L9 32 13 41 23 35 19 58 29 59 32 43 35 59 45 58 41 35 51 41 55 32 40 24Z","#b87b50");o(28,14,2,cream);o(36,14,2,cream);p("M27 19 Q32 23 37 19","none",cream,2);o(32,32,3,red);o(32,40,3,green);break;
 case "noel_cupcake":p("M14 35 H50 L44 59 H20Z",red,gold);for(let x=23;x<48;x+=7)p("M"+x+" 39 l-2 16","none",cream,1.5);p("M13 35 Q8 24 22 23 Q15 12 32 8 Q49 12 42 23 Q57 24 51 35Z",cream,gold);o(32,8,5,red);break;
 case "crystal_drop":cap();p("M32 11 L50 35 32 60 14 35Z",ice,"#7eafc8");p("M32 11 V60 L50 35Z","#83bdd8","#e9fbff");p("M14 35 H50","none","#fff",2);break;
 case "jewel_star":cap();star(32,34,"#e4c9a1");o(32,34,10,ice,gold);for(let i=0;i<5;i++)o(32+15*Math.cos(i*2*Math.PI/5),34+15*Math.sin(i*2*Math.PI/5),3,"#fff");break;
 case "gold_pendant":cap();p("M32 12 L51 29 43 51 32 60 21 51 13 29Z",gold,"#9c7334");p("M32 19 L44 30 39 45 32 51 25 45 20 30Z","#9a465a",cream);break;
 case "pearl_garland":for(let i=0;i<11;i++){let t=i/10;o(7+50*t,18+26*4*t*(1-t),4.3,i%2?"#f1dfc2":"#fffaf3","#b59d85")}bow(32,48,gold);break;
 case "glass_bell":cap();p("M12 49 Q21 37 21 26 Q21 12 32 12 Q43 12 43 26 Q43 37 52 49Z",ice,"#84b7ca",2);p("M25 19 Q19 34 16 43","none","#fff",3);o(32,52,5,gold);break;
 case "ice_icicle":cap();p("M20 13 L43 13 38 27 34 60 25 39Z",ice,"#78b3d3");p("M32 14 L34 60 25 39Z","#f7ffff","none");p("M20 13 L38 27","none","#fff");break;
 case "tiger_noel":o(14,21,8,"#e6a353");o(50,21,8,"#e6a353");face("#f0b361");for(const d of ["M18 27 l6 4","M46 27 l-6 4","M17 40 l6 -2","M47 40 l-6 -2"])p(d,"none","#76503d",3);hat();break;
 case "cat_scarf":p("M12 32 L12 10 29 24 M52 32 L52 10 35 24","#f5dbbe");face("#f5dbbe");scarf();break;
 case "dachshund_noel":e(34,40,24,12,"#a96b42");r(19,42,8,15,3,"#875233");r(44,43,8,14,3,"#875233");r(25,29,24,21,5,red,gold);e(15,30,13,12,"#b97b4d");e(12,36,5,11,"#875233");o(15,28,2,"#3d3029");hat();break;
 case "rabbit_deer":e(21,15,7,14,cream);e(43,15,7,14,cream);p("M18 16 L9 5 M12 9 L4 10 M46 16 L55 5 M52 9 L60 10","none","#a77c50",3);face(cream);o(32,40,4,red);break;
 case "polar_bow":o(15,21,8,"#fff");o(49,21,8,"#fff");face("#fff");bow(32,50);break;
 case "penguin_scarf":e(32,34,23,28,"#344552");e(32,38,16,21,cream);o(25,28,2,"#344552");o(39,28,2,"#344552");p("M27 32 H37 L32 37Z",gold);scarf();break;
 }return s;
}
