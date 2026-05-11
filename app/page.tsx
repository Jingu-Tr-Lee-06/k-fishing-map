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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", species: "", note: "" });

  // 📍 날씨 관련 상태 추가
  const [weatherData, setWeatherData] = useState<any>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);

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

  // 📍 실시간 날씨 호출 함수
  const fetchWeather = async (lat: number, lng: number) => {
    setIsWeatherLoading(true);
    setWeatherData(null);
    const API_KEY = process.env.NEXT_PUBLIC_WEATHER_API_KEY;
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric&lang=kr`
      );
      const data = await response.json();
      setWeatherData(data);
    } catch (e) {
      console.error("날씨 정보 호출 실패:", e);
    } finally {
      setIsWeatherLoading(false);
    }
  };

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
    if (!formData.name) return alert("포인트 이름을 입력해주세요!");
    try {
      await addDoc(collection(db, "fishingPoints"), {
        ...formData,
        lat: selectedPos.lat,
        lng: selectedPos.lng,
        userId: user.uid,
        userName: user.displayName,
        createdAt: new Date()
      });
      alert("포인트가 등록되었습니다!");
      setIsInputModalOpen(false);
      setSelectedPos(null);
      setFormData({ name: "", species: "", note: "" });
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
    } catch (e) { alert("실패했습니다."); }
  };

  return (
    <main className="flex w-full h-screen text-black bg-white overflow-hidden relative font-sans">
      
      {/* 사이드바 */}
      <aside className={`fixed md:relative w-80 h-full bg-slate-900 text-white flex flex-col z-[1001] shadow-2xl transition-transform duration-300 ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:hidden"
      }`}>
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h1 className="text-xl font-black italic text-blue-400">K-FISHING</h1>
          <div className="flex gap-2">
            {user ? <button onClick={handleLogout} className="text-[10px] bg-slate-700 px-2 py-1 rounded">OUT</button> : <button onClick={handleLogin} className="text-[10px] bg-blue-600 px-2 py-1 rounded">LOGIN</button>}
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 text-xl">✕</button>
          </div>
        </div>

        {user && (
          <div className="px-6 py-2 bg-slate-800/30 flex items-center gap-3 border-b border-slate-800 text-[11px] font-bold text-slate-300">
            <img src={user.photoURL} alt="p" className="w-5 h-5 rounded-full" /> {user.displayName}
          </div>
        )}
        
        <div className="p-4 bg-slate-800/50 flex flex-wrap gap-1.5 border-b border-slate-800">
          {CITIES.map((city) => (
            <button key={city.name} onClick={() => { setSelectedCity(city); setMapCenter(city.center); setMapZoom(city.zoom); }} className={`px-2.5 py-1.5 rounded text-[10px] font-bold transition-all ${selectedCity.name === city.name ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400"}`}>{city.name}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <p className="text-[10px] font-bold text-slate-500 mb-4 flex justify-between uppercase tracking-wider"><span>{selectedCity.name} POINTS</span><span>{filteredPoints.length}</span></p>
          <div className="flex flex-col gap-2">
            {filteredPoints.map((p) => (
              <div key={p.id} className="relative group">
                <button onClick={() => { setMapCenter([p.lat, p.lng]); setMapZoom(15); if(window.innerWidth < 768) setIsSidebarOpen(false); }} className="w-full text-left p-4 rounded-xl bg-slate-800 border border-slate-700 hover:bg-blue-900/40 transition-all">
                  <div className="text-sm font-bold truncate">{p.name}</div>
                  <div className="text-[10px] text-blue-400 mt-1 font-medium">{p.species || "어종 미확인"}</div>
                  {p.note && <div className="text-[10px] text-slate-500 mt-1 line-clamp-1">{p.note}</div>}
                </button>
                {p.userId === user?.uid && <button onClick={(e) => handleDelete(e, p.id)} className="absolute right-4 top-4 text-slate-600 hover:text-red-500 transition-colors">🗑️</button>}
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 border-t border-slate-800 bg-slate-900/90 mt-auto">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[11px] font-black text-blue-400 tracking-wider">JH's SW Lab</h3>
            <div className="flex flex-col">
              <p className="text-[10px] text-slate-400 font-bold">진구이선생 (이진호)</p>
              <a href="mailto:jingu.tr.lee@gmail.com" className="text-[9px] text-slate-500 hover:text-blue-300 transition-colors">jingu.tr.lee@gmail.com</a>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800/50">
              <p className="text-[9px] text-slate-600 leading-tight">© 2026 K-FISHING. All rights reserved.</p>
              <p className="text-[8px] text-slate-700 mt-0.5 uppercase tracking-tighter">Map data © OpenStreetMap contributors</p>
            </div>
          </div>
        </div>
      </aside>

      {/* 지도 섹션 */}
      <section className="flex-1 relative h-full">
        {!isSidebarOpen && (
          <button onClick={() => setIsSidebarOpen(true)} className="absolute top-4 left-4 z-[1002] bg-slate-900 p-3 rounded-lg flex flex-col gap-1 shadow-2xl border border-slate-700">
            <div className="w-5 h-0.5 bg-blue-400"></div><div className="w-5 h-0.5 bg-blue-400"></div><div className="w-5 h-0.5 bg-blue-400"></div>
          </button>
        )}

        {mounted && L && (
          <MapContainer center={mapCenter} zoom={mapZoom} minZoom={7} maxBounds={KOREA_BOUNDS} maxBoundsViscosity={1.0} style={{ width: "100%", height: "100%" }} zoomControl={false}>
            <ChangeView center={mapCenter} zoom={mapZoom} />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <LocationMarker onLocationSelect={(latlng) => setSelectedPos(latlng)} />
            
            {points.map((p) => (
              <Marker 
                key={p.id} 
                position={[p.lat, p.lng]}
                eventHandlers={{
                  click: () => fetchWeather(p.lat, p.lng),
                }}
              >
                <Popup>
                  <div className="p-1 min-w-[180px] text-black">
                    <div className="font-bold text-blue-600 text-base border-b pb-1 mb-2">{p.name}</div>
                    
                    {/* 📍 날씨 정보 영역 */}
                    <div className="bg-slate-50 p-2 rounded-lg mb-2">
                      <p className="text-[10px] font-bold text-slate-400 mb-1">CURRENT WEATHER</p>
                      {isWeatherLoading ? (
                        <p className="text-[11px] animate-pulse">불러오는 중...</p>
                      ) : weatherData ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <img src={`https://openweathermap.org/img/wn/${weatherData.weather[0].icon}.png`} className="w-8 h-8" alt="w" />
                            <span className="text-sm font-bold">{Math.round(weatherData.main.temp)}°C</span>
                          </div>
                          <div className="text-right text-[10px] text-slate-600 font-medium">
                            <p>{weatherData.weather[0].description}</p>
                            <p>💨 {weatherData.wind.speed}m/s</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400">마커를 클릭해 날씨 확인</p>
                      )}
                    </div>

                    <div className="text-xs text-slate-600 font-bold mt-1">🐟 {p.species || "어종 정보 없음"}</div>
                    {p.note && <div className="text-[11px] bg-blue-50 p-2 mt-2 rounded border-l-2 border-blue-400 whitespace-pre-wrap">{p.note}</div>}
                    <div className="text-[9px] text-slate-400 mt-2 text-right border-t pt-1 uppercase">By {p.userName}</div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {selectedPos && <Marker position={selectedPos}><Popup>새 포인트 등록 중...</Popup></Marker>}
          </MapContainer>
        )}
        
        {selectedPos && !isInputModalOpen && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] w-[80%] md:w-auto">
            <button onClick={() => setIsInputModalOpen(true)} className="w-full md:w-auto bg-blue-600 text-white px-8 py-4 rounded-full font-bold shadow-2xl animate-bounce">
              📍 선택한 위치에 정보 기록하기
            </button>
          </div>
        )}

        {isInputModalOpen && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="bg-blue-600 p-4 text-white font-bold flex justify-between items-center">
                <span>새로운 낚시 명당 기록</span>
                <button onClick={() => setIsInputModalOpen(false)} className="hover:rotate-90 transition-transform text-xl">✕</button>
              </div>
              <div className="p-6 flex flex-col gap-4 text-black">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">포인트 이름 *</label>
                  <input type="text" placeholder="예: 금강 합수부 수중여" className="w-full border-b-2 border-slate-200 p-2 focus:border-blue-500 outline-none transition-all" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">주요 어종</label>
                  <input type="text" placeholder="예: 배스, 쏘가리, 꺽지 등" className="w-full border-b-2 border-slate-200 p-2 focus:border-blue-500 outline-none transition-all" value={formData.species} onChange={(e) => setFormData({...formData, species: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">특징 및 메모</label>
                  <textarea placeholder="진입로나 밑걸림 정도를 적어주세요." className="w-full border-2 border-slate-100 p-3 rounded-lg h-24 focus:border-blue-500 outline-none transition-all text-sm" value={formData.note} onChange={(e) => setFormData({...formData, note: e.target.value})} />
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setIsInputModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold">취소</button>
                  <button onClick={handleSave} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-200">기록 완료</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}