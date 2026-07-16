'use client';

import { useState, useEffect } from 'react';

export default function AuthVideoBackground() {
  // Se determina en el cliente para no descargar el video en móvil
  const [showVideo, setShowVideo] = useState(false);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    const check = () => setShowVideo(window.innerWidth >= 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <>
      {/* Poster como fondo base: siempre presente (móvil + fallback de error) */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: -1,
          backgroundImage: 'url(/videos/fondo-login-v2-poster.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Video — solo en escritorio (≥640 px) y sin error de carga */}
      {showVideo && !videoError && (
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/videos/fondo-login-v2-poster.jpg"
          onError={() => setVideoError(true)}
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
          }}
        >
          <source src="/videos/fondo-login-v2.mp4" type="video/mp4" />
        </video>
      )}

      {/* Overlay gradiente náutico: más translúcido en el centro, oscuro en las orillas */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 1,
          background:
            'radial-gradient(ellipse at center, rgba(10,34,64,0.10) 0%, rgba(10,34,64,0.25) 50%, rgba(10,34,64,0.55) 100%)',
        }}
      />
    </>
  );
}
