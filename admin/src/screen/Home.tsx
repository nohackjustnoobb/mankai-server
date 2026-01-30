import { useState } from "react";
import authService from "../utils/auth";
import UserManagement from "./UserManagement";
import MangaManagement from "./MangaManagement";
import "./Home.css";

const Home = () => {
  const [activeTab, setActiveTab] = useState<"users" | "manga">("users");

  return (
    <div className="home-container">
      <div className="home-content fade-in">
        <header className="dashboard-header">
          <div className="mode-switcher">
            <button
              onClick={() => setActiveTab("users")}
              className={activeTab === "users" ? "active" : ""}
            >
              User Management
            </button>
            <button
              onClick={() => setActiveTab("manga")}
              className={activeTab === "manga" ? "active" : ""}
            >
              Manga Management
            </button>
          </div>

          <div className="header-actions">
            <button
              className="btn-logout"
              onClick={() => {
                if (window.confirm("Are you sure you want to sign out?"))
                  authService.logout();
              }}
              title="Logout"
            >
              Sign out
            </button>
          </div>
        </header>

        {activeTab === "users" ? <UserManagement /> : <MangaManagement />}
      </div>
    </div>
  );
};

export default Home;
