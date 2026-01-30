import React from "react";
import authService from "./utils/auth";
import Home from "./screen/Home";
import Login from "./screen/Login";

class App extends React.Component {
  constructor(props: object) {
    super(props);

    authService.updateCallback = this.forceUpdate.bind(this);
  }

  render() {
    return authService.isAuthenticated ? <Home /> : <Login />;
  }
}

export default App;
