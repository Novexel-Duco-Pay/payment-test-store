import { Link, NavLink, Outlet } from 'react-router-dom';
import { useCartCount } from '../lib/cart.js';

export default function Layout() {
  const count = useCartCount();

  return (
    <>
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="brand">
            <span className="brand__mark" aria-hidden="true">
              ◆
            </span>
            Sandbox Store
          </Link>
          <nav className="nav">
            <NavLink to="/" end className="nav__link">
              Products
            </NavLink>
            <NavLink to="/cart" className="nav__link nav__cart">
              Cart
              <span className="badge" hidden={count === 0}>
                {count}
              </span>
            </NavLink>
          </nav>
        </div>
      </header>
      <Outlet />
    </>
  );
}
