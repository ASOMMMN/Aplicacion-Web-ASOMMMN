'use client';

import { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Navbar, Nav, Container, Button } from 'react-bootstrap';
import { ALT_ESCUDO, NOMBRE_LARGO, NOMBRE_CORTO } from '@/lib/branding';

export interface NavItem {
  href: string;
  label: string;
}

interface AppNavbarProps {
  /** Href del brand (logo) */
  brandHref: string;
  /** Rol mostrado debajo del nombre: "Postulante" | "Evaluador" | "Administrador" */
  rolLabel: string;
  /** Ítems del menú */
  navItems: NavItem[];
  /** Callback de logout */
  onLogout: () => void;
  /** Slot opcional para controles extra (ej. campana de notificaciones) antes del botón de logout */
  rightContent?: ReactNode;
}

export default function AppNavbar({
  brandHref,
  rolLabel,
  navItems,
  onLogout,
  rightContent,
}: AppNavbarProps) {
  return (
    <Navbar expand="lg" className="navbar-asommmn sticky-top" collapseOnSelect>
      <Container fluid>
        {/* Marca: escudo + nombre de la Asociación + lema */}
        <Navbar.Brand as={Link} href={brandHref} className="d-flex align-items-center gap-2">
          <Image
            src="/escudo-ASOMMMN-transparente.png"
            alt={ALT_ESCUDO}
            title={NOMBRE_LARGO}
            width={46}
            height={46}
            style={{ flexShrink: 0 }}
            priority
          />
          <div>
            <span className="d-block font-serif" style={{ fontSize: '0.85rem', lineHeight: 1.2 }}>
              Asociación Sindical
            </span>
            <span className="d-block fw-bold font-serif" style={{ fontSize: '0.9rem', lineHeight: 1.2 }}>
              {NOMBRE_CORTO}&nbsp;
              <span className="fw-normal" style={{ fontFamily: 'var(--font-public-sans), sans-serif', color: 'var(--asommmn-dorado)', fontSize: '0.75rem' }}>
                · {rolLabel}
              </span>
            </span>
          </div>
        </Navbar.Brand>

        <Navbar.Toggle aria-controls="asommmn-nav" />
        <Navbar.Collapse id="asommmn-nav">
          <Nav className="ms-auto align-items-lg-center gap-lg-1">
            {navItems.map((item) => (
              <Nav.Link key={item.href} as={Link} href={item.href}>
                {item.label}
              </Nav.Link>
            ))}
            {rightContent && (
              <div className="d-flex align-items-center ms-lg-2 mt-2 mt-lg-0">
                {rightContent}
              </div>
            )}
            <Button
              size="sm"
              className="btn-logout-asommmn ms-lg-3 mt-2 mt-lg-0"
              onClick={onLogout}
            >
              <i className="bi bi-box-arrow-right me-1" />
              Cerrar sesión
            </Button>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
