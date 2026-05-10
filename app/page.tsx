"use client";

import React, { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import { db } from "../lib/firebase"; 
import { collection, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "firebase/auth";

const KOREA_BOUNDS: [number, number][] = [[32.0, 123.5], [39.0, 132.5]];

const CITIES = [
  { name: "전체", center: [36.3, 127.8], zoom: 7, bounds: [[32.0, 123.5], [39.0, 132.5]] },
  { name: "서울/경기", center: [37.56, 126.97], zoom: 10, bounds: [[36.9, 126.1], [38.3, 127.8]] },
  { name: "강원도", center: [37.75, 128.87], zoom: 9, bounds: [[37.0, 127.5], [38.6, 129.6]] },
  { name: "충청남도", center: [36.65, 126.67], zoom: 9, bounds: [[35.9, 125.9], [37.1, 127.6]] },
  { name: "충청북도", center: [36.63, 127.48], zoom: 9, bounds: [[36.0, 127.3], [37.3, 128.6]] },
  { name: "전라남도", center: [34.3, 126.46], zoom: 9, bounds: [[33.0, 125.8], [35.3, 127.8]] },
  { name: "전라북도", center: [35.7, 127.14], zoom: 9, bounds: [[35.3, 126.3], [36.1, 127.9]] },
  { name: "경상남도", center: [35.23, 128.69], zoom: 9, bounds: [[34.4, 127.5], [35.9, 129.4]] },
  { name: "경상북도", center: [36.57, 128.50], zoom: 9, bounds: [[35.5, 127.8], [37.6, 129.6]] },
  { name: "제주도", center: [33.36, 126.53], zoom: 10, bounds: [[33.0, 126.0], [34.0, 127.0]] },
];

const MapContainer = dynamic(() => import("react-leaflet").then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((mod) => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((mod) => mod.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((mod) => mod.Popup), { ssr: false });

const ChangeView = ({ center, zoom }: { center: any, zoom: any }) => {
  const [useMap, setUseMap] = useState<any>(null);
  useEffect(() => { import("react-leaflet").then((mod) => setUseMap(() => mod.useMap)); }, []);
  if (!useMap) return null;
  return <MapMoveInternal useMap={useMap} center={center} zoom={zoom} />;
};

const MapMoveInternal = ({ useMap, center, zoom }: any) => {
  const map = useMap();
  useEffect(() => {
    if (map && typeof map.flyTo === 'function') {
      const timer = setTimeout(() => {
        try { map.flyTo(center, zoom, { animate: true, duration: 1 }); } catch (e) {}
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [center, zoom, map]);
  return null;
};

const LocationMarker = ({ onLocationSelect }: { onLocationSelect: (latlng: any) => void }) => {
  const [useMapEvents, setUseMapEvents] = useState<any>(null);
  useEffect(() => { import("react-leaflet").then((mod) => setUseMapEvents(() => mod.useMapEvents)); }, []);
  if (!useMapEvents) return null;
  return <MapClickEvents useMapEvents={useMapEvents} onLocationSelect={onLocationSelect} />;
};

const MapClickEvents = ({ useMapEvents, onLocationSelect }: any) => {
  useMapEvents({ click(e: any) { onLocationSelect(e.latlng); } });
  return null;
};

export default function Home() {
  const [L, setL] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [selectedPos, setSelectedPos] = useState<any>(null);
  const [points, setPoints] = useState<any[]>([]);
  const [selectedCity, setSelectedCity] = useState(CITIES[0]);
  const [mapCenter, setMapCenter] = useState<any>(CITIES[0].center);
  const [mapZoom, setMapZoom] = useState(CITIES[0].zoom);
  const [user, setUser] = useState<any>(null);
  const auth = getAuth();

  useEffect(() => {
    setMounted(true);
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => { setUser(currentUser); });
    import("leaflet").then((leaflet) => {
      const icon = leaflet.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      leaflet.Marker.prototype.options.icon = icon;
      setL(leaflet);
    });
    fetchPoints();
    return () => unsubscribe();
  }, []);

  const fetchPoints = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "fishingPoints"));
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPoints(data);
    } catch (e) { console.error(e); }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); } catch (e) { alert("로그인 실패!"); }
  };

  const handleLogout = () => signOut(auth);

  const filteredPoints = useMemo(() => {
    let list = points.filter(p => {
      const [[minLat, minLng], [maxLat, maxLng]] = selectedCity.bounds;
      return p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng;
    });
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [points, selectedCity]);

  const handleSave = async () => {
    if (!user) return alert("로그인이 필요합니다!");
    if (!selectedPos) return;
    const pointName = prompt("포인트 이름을 입력하세요");
    if (!pointName) return;
    try {
      await addDoc(collection(db, "fishingPoints"), {
        name: pointName, lat: selectedPos.lat, lng: selectedPos.lng, userId: user.uid, createdAt: new Date()
      });
      alert("저장 성공!");
      setSelectedPos(null);
      fetchPoints();
    } catch (e) { alert("저장 실패!"); }
  };

  const handleDelete = async (e: React.MouseEvent, pointId: string) => {
    e.stopPropagation();
    if (!confirm("정말 이 포인트를 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "fishingPoints", pointId));
      alert("삭제되었습니다.");
      fetchPoints();
    } catch (e) { alert("삭제 권한이 없거나 실패했습니다."); }
  };

  return (
    // 📍 md:flex-row를 주어 데스크톱에선 가로, 모바일에선 세로(flex-col)로 배치
    <main className="flex flex-col md:flex-row w-full h-screen text-black bg-white overflow-hidden">
      
      {/* 📍 사이드바: 모바일에선 하단, 데스크톱에선 왼쪽 고정 */}
      <aside className="w-full md:w-80 h-[40vh] md:h-full bg-slate-900 text-white flex flex-col z-[1001] shadow-2xl order-2 md:order-1">
        <div className="p-4 md:p-6 border-b border-slate-800 flex justify-between items-center">
          <h1 className="text-xl font-black italic text-blue-400 tracking-tighter">K-FISHING</h1>
          {user ? (
            <button onClick={handleLogout} className="text-[10px] bg-slate-700 px-2 py-1 rounded">로그아웃</button>
          ) : (
            <button onClick={handleLogin} className="text-[10px] bg-blue-600 px-2 py-1 rounded">로그인</button>
          )}
        </div>

        {user && (
          <div className="px-6 py-2 bg-slate-800/30 flex items-center gap-3 border-b border-slate-800">
            <img src={user.photoURL} alt="profile" className="w-5 h-5 rounded-full" />
            <span className="text-[11px] font-bold text-slate-300">{user.displayName}님</span>
          </div>
        )}
        
        {/* 📍 지역 필터: 모바일에서도 보기 편하게 스크롤 가능하게 처리 */}
        <div className="p-3 bg-slate-800/50 flex flex-nowrap md:flex-wrap overflow-x-auto md:overflow-visible gap-1.5 border-b border-slate-800 no-scrollbar">
          {CITIES.map((city) => (
            <button
              key={city.name}
              onClick={() => { setSelectedCity(city); setMapCenter(city.center); setMapZoom(city.zoom); }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                selectedCity.name === city.name ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"
              }`}
            >
              {city.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-4">
            <p className="text-[10px] font-bold text-slate-500 mb-3 flex justify-between uppercase">
              <span>{selectedCity.name} 포인트</span>
              <span>{filteredPoints.length}개</span>
            </p>
            <div className="flex flex-col gap-2">
              {filteredPoints.map((p) => (
                <div key={p.id} className="relative group">
                  <button
                    onClick={() => { setMapCenter([p.lat, p.lng]); setMapZoom(15); }}
                    className="w-full text-left p-3 pr-10 rounded-xl bg-slate-800 border border-slate-700 transition-all"
                  >
                    <div className="text-sm font-bold truncate">{p.name}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">{p.userId === user?.uid ? "⭐ 내가 등록함" : "낚시 포인트"}</div>
                  </button>
                  {p.userId === user?.uid && (
                    <button onClick={(e) => handleDelete(e, p.id)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 p-2">🗑️</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* 📍 지도 섹션: 모바일에선 위쪽(60vh), 데스크톱에선 나머지 전체 */}
      <section className="flex-1 h-[60vh] md:h-full relative order-1 md:order-2">
        {mounted && L && (
          <MapContainer center={mapCenter} zoom={mapZoom} minZoom={7} maxBounds={KOREA_BOUNDS} maxBoundsViscosity={1.0} style={{ width: "100%", height: "100%" }} zoomControl={false}>
            <ChangeView center={mapCenter} zoom={mapZoom} />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <LocationMarker onLocationSelect={(latlng) => setSelectedPos(latlng)} />
            {points.map((p) => (
              <Marker key={p.id} position={[p.lat, p.lng]}>
                <Popup><div className="font-bold text-blue-600">{p.name}</div></Popup>
              </Marker>
            ))}
            {selectedPos && <Marker position={selectedPos}><Popup>등록 대기</Popup></Marker>}
          </MapContainer>
        )}
        
        {/* 📍 저장 버튼: 모바일에서도 중앙 하단에 잘 보이게 유지 */}
        {selectedPos && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[90%] md:w-auto">
            <button onClick={handleSave} className="w-full md:w-auto bg-blue-600 text-white px-8 py-3.5 rounded-full font-bold shadow-2xl hover:bg-blue-500 transition-all">
              {user ? "📍 이 위치 저장" : "🔒 로그인 후 저장"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}